/**
 * API: Create Quotation (POST)
 * 彻底解决 auth.id 为空导致的权限拦截问题
 */

export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;

  /* =========================================================
   * 1. Direct Auth Check (直接通过 Session 校验用户)
   * ========================================================= */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return jsonError("Unauthorized: Session missing", 401);
  }

  // 直接从数据库通过 token 获取当前用户的真实 id 和 role
  const user = await db.prepare(`
    SELECT id, username, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return jsonError("Unauthorized: Invalid session", 401);
  }

  const userRole = (user.role || "").toString().trim().toLowerCase();

  // 仅允许 admin 和 moderator 访问
  if (userRole !== "admin" && userRole !== "moderator") {
    return jsonError("Permission denied: Insufficient role", 403);
  }

  try {
    const body = await request.json();
    const {
      customer,
      project_id,
      project_title,
      project_address,
      terms_id,
      discount = 0,
      sections = []
    } = body;

    if (!customer || !customer.trim()) {
      return jsonError("Customer required", 400);
    }

    /* =========================================================
     * 2. 权限隔离：校验关联项目的归属权
     * ========================================================= */
    if (project_id) {
      const project = await db.prepare(`SELECT id, created_by FROM projects WHERE id = ?`).bind(project_id).first();

      if (!project) {
        return jsonError("Associated project not found", 404);
      }

      const projectOwnerId = String(project.created_by || "").trim();
      const currentUserId  = String(user.id || "").trim();

      // 非 Admin 校验：Moderator 只能为自己创建的项目新建报价单
      if (userRole !== "admin" && projectOwnerId !== currentUserId) {
        return jsonError(`Permission denied: You cannot create quotation for a project you do not own. (Project Owner: ${projectOwnerId}, Your ID: ${currentUserId})`, 403);
      }
    }

    // 生成报价单号
    const quotationNo = "QT" + new Date().toISOString().slice(0,10).replace(/-/g,"") + "-" + Math.floor(1000 + Math.random() * 9000);

    // 获取条款快照
    let termsSnapshot = null;
    if (terms_id) {
      const term = await db.prepare(`SELECT content FROM quotation_terms WHERE id = ? AND is_active = 1`).bind(terms_id).first();
      if (term) termsSnapshot = term.content;
    }

    /* =========================================================
     * 3. 执行数据写入 (主表 + D1 Batch 批处理)
     * ========================================================= */
    const qRes = await db.prepare(`
      INSERT INTO quotations (
        quotation_no, customer, project_id, project_title, project_address, 
        terms_id, terms_snapshot, discount, subtotal, grand_total, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, datetime('now'))
    `).bind(
      quotationNo,
      customer.trim(),
      project_id || null,
      project_title || "",
      project_address || "",
      terms_id || null,
      termsSnapshot,
      Number(discount) || 0,
      user.id // 绑定当前创建人真实的 user.id
    ).run();

    const quotationId = qRes.meta.last_row_id;
    let subtotal = 0;
    const batchStatements = [];

    for (let s = 0; s < sections.length; s++) {
      const sec = sections[s];
      
      const secRes = await db.prepare(`
        INSERT INTO quotation_sections (quotation_id, section_title, sort_order, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `).bind(quotationId, sec.section_title || "", s).run();

      const sectionId = secRes.meta.last_row_id;

      for (let i = 0; i < (sec.items || []).length; i++) {
        const it = sec.items[i];
        const qty = Number(it.qty) || 0;
        const price = Number(it.price || it.unit_price) || 0;
        const lineTotal = qty * price;
        subtotal += lineTotal;

        batchStatements.push(
          db.prepare(`
            INSERT INTO quotation_items (
              quotation_id, section_id, item_no, description, UOM, qty, unit_price, line_total, sort_order, is_priced
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          `).bind(quotationId, sectionId, String(i + 1), it.description || "", it.UOM || "", qty, price, lineTotal, i)
        );
      }
    }

    const grandTotal = Math.max(0, subtotal - (Number(discount) || 0));
    batchStatements.push(
      db.prepare(`UPDATE quotations SET subtotal = ?, grand_total = ? WHERE id = ?`)
        .bind(subtotal, grandTotal, quotationId)
    );

    if (batchStatements.length > 0) {
      await db.batch(batchStatements);
    }

    return jsonOK({ id: quotationId, quotation_no: quotationNo });

  } catch (err) {
    console.error("Create Quotation Error:", err);
    return jsonError("Failed to create quotation: " + err.message, 500);
  }
}

function jsonOK(data) { 
  return new Response(JSON.stringify({ success: true, data }), { 
    headers: { "Content-Type": "application/json" } 
  }); 
}

function jsonError(msg, status = 400) { 
  return new Response(JSON.stringify({ success: false, error: msg }), { 
    status, 
    headers: { "Content-Type": "application/json" } 
  }); 
}
