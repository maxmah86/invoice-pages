/**
 * API: /api/quotation-create (POST)
 * 功能：创建新报价单，单号基于选择的日期生成
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;

  /* ===============================
   * 1. Admin Auth (管理员验证)
   * =============================== */
  const authRes = await fetch(new URL("/api/auth-check", request.url), {
    headers: { Cookie: request.headers.get("Cookie") || "" }
  });
  const auth = await authRes.json();

  if (!auth.loggedIn || auth.role !== "admin") {
    return jsonError("Permission denied", 403);
  }

  try {
    const body = await request.json();
    const {
      customer,
      created_at,       // 用户选择的日期 (格式: YYYY-MM-DD)
      project_id,
      project_title,
      project_address,
      terms_id,
      discount = 0,
      sections = []
    } = body;

    // 基础验证
    if (!customer) return jsonError("Customer name is required", 400);
    if (!created_at) return jsonError("Quotation date is required", 400);

    /* ===============================
     * 2. 生成单号 (基于选择的日期)
     * =============================== */
    // 将 "2026-02-14" 转换为 "20260214"
    const datePart = created_at.split('T')[0].replace(/-/g, '');
    // 生成格式: QT20260214-8888
    const quotationNo = `QT${datePart}-${Math.floor(1000 + Math.random() * 9000)}`;

    /* ===============================
     * 3. 获取条款快照 (Terms Snapshot)
     * =============================== */
    let termsSnapshot = null;
    if (terms_id) {
      const term = await db.prepare("SELECT content FROM quotation_terms WHERE id = ? AND is_active = 1")
        .bind(terms_id)
        .first();
      if (term) termsSnapshot = term.content;
    }

    /* ===============================
     * 4. 插入主表 (Master Table)
     * =============================== */
    const qRes = await db.prepare(`
      INSERT INTO quotations (
        quotation_no, customer, project_id, project_title, 
        project_address, terms_id, terms_snapshot, discount, 
        subtotal, grand_total, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, datetime('now'))
    `).bind(
      quotationNo,
      customer,
      project_id || null,
      project_title || "",
      project_address || "",
      terms_id || null,
      termsSnapshot,
      Number(discount) || 0,
      created_at // 存储用户选定的日期
    ).run();

    const quotationId = qRes.meta.last_row_id;
    let runningSubtotal = 0;

    /* ===============================
     * 5. 循环插入 Sections 和 Items
     * =============================== */
    for (let s = 0; s < sections.length; s++) {
      const sec = sections[s];
      
      // 插入 Section
      const secRes = await db.prepare(`
        INSERT INTO quotation_sections (quotation_id, section_title, sort_order, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `).bind(quotationId, sec.section_title || "", s).run();

      const sectionId = secRes.meta.last_row_id;

      // 插入 Items
      for (let i = 0; i < (sec.items || []).length; i++) {
        const it = sec.items[i];
        const qty = Number(it.qty) || 0;
        const price = Number(it.price || it.unit_price) || 0;
        const lineTotal = qty * price;
        runningSubtotal += lineTotal;

        await db.prepare(`
          INSERT INTO quotation_items (
            quotation_id, item_no, description, UOM, qty, unit_price, line_total, 
            section_id, sort_order, is_priced
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).bind(
          quotationId,
          String(i + 1),
          it.description || "",
          it.UOM || "",
          qty,
          price,
          lineTotal,
          sectionId,
          i
        ).run();
      }
    }

    /* ===============================
     * 6. 更新最终总价
     * =============================== */
    const finalGrandTotal = Math.max(0, runningSubtotal - Number(discount));

    await db.prepare(`
      UPDATE quotations
      SET subtotal = ?, grand_total = ?
      WHERE id = ?
    `).bind(runningSubtotal, finalGrandTotal, quotationId).run();

    // 返回新生成的单号和ID
    return jsonOK({ 
      id: quotationId, 
      quotation_no: quotationNo 
    });

  } catch (err) {
    console.error("Create Error:", err);
    return jsonError(err.message || "Failed to create quotation", 500);
  }
}

/* =========================================================
 * 辅助函数 (Helpers)
 * ========================================================= */
function jsonOK(data) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { "Content-Type": "application/json" }
  });
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
