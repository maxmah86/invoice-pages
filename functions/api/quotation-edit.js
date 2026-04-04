/**
 * API: /api/quotation-edit (POST)
 * 功能：更新现有的报价单，包括 Master 数据、Sections 和 Items
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;

  /* ===============================
   * 1. 权限检查 (Admin Auth)
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
      id,
      customer,
      created_at,       // 从前端传入的日期 (YYYY-MM-DD)
      project_title,
      project_address,
      terms_id,
      discount = 0,
      sections = []
    } = body;

    // 基础验证
    if (!id) return jsonError("Missing quotation ID", 400);
    if (!customer) return jsonError("Customer name is required", 400);

    /* ===============================
     * 2. 检查报价单是否存在
     * =============================== */
    const existing = await db.prepare("SELECT id FROM quotations WHERE id = ?")
      .bind(id)
      .first();
      
    if (!existing) {
      return jsonError("Quotation not found", 404);
    }

    /* ===============================
     * 3. 获取条款快照 (Terms Snapshot)
     * =============================== */
    let termsSnapshot = null;
    if (terms_id) {
      const term = await db.prepare("SELECT content FROM quotation_terms WHERE id = ? AND is_active = 1")
        .bind(terms_id)
        .first();
      if (term) {
        termsSnapshot = term.content;
      }
    }

    /* ===============================
     * 4. 执行更新流程 (使用 D1 事务批量执行)
     * =============================== */
    
    // A. 更新主表 (Master Table)
    // 注意：created_at 被用来存储报价单日期，updated_at 记录最后修改时间
    const updateMaster = db.prepare(`
      UPDATE quotations
      SET
        customer = ?,
        created_at = ?,
        project_title = ?,
        project_address = ?,
        terms_id = ?,
        terms_snapshot = ?,
        discount = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      customer,
      created_at || null,
      project_title || null,
      project_address || null,
      terms_id || null,
      termsSnapshot,
      Number(discount) || 0,
      id
    );

    // B. 清理旧数据 (Delete old child records)
    const deleteItems = db.prepare("DELETE FROM quotation_items WHERE quotation_id = ?").bind(id);
    const deleteSections = db.prepare("DELETE FROM quotation_sections WHERE quotation_id = ?").bind(id);

    // 执行第一阶段：更新主表并清空旧项
    await db.batch([updateMaster, deleteItems, deleteSections]);

    /* ===============================
     * 5. 重新创建 Sections 和 Items
     * =============================== */
    let runningSubtotal = 0;

    for (let s = 0; s < sections.length; s++) {
      const sec = sections[s];
      
      // 插入 Section
      const secRes = await db.prepare(`
        INSERT INTO quotation_sections (quotation_id, section_title, sort_order, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `).bind(id, sec.section_title || "", s).run();

      const sectionId = secRes.meta.last_row_id;

      // 循环插入该 Section 下的所有 Items
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
          id,
          String(i + 1),        // item_no
          it.description || "",
          it.UOM || "",
          qty,
          price,
          lineTotal,
          sectionId,
          i                     // sort_order
        ).run();
      }
    }

    /* ===============================
     * 6. 计算并更新最终总价
     * =============================== */
    const finalGrandTotal = Math.max(0, runningSubtotal - Number(discount));

    await db.prepare(`
      UPDATE quotations
      SET subtotal = ?, grand_total = ?
      WHERE id = ?
    `).bind(runningSubtotal, finalGrandTotal, id).run();

    return jsonOK({ id });

  } catch (err) {
    console.error("Update Error:", err);
    return jsonError(err.message || "Server Error during update", 500);
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
