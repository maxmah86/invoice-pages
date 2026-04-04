export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;

  // ... 权限检查省略 ...

  try {
    const body = await request.json();
    const {
      id,
      customer,
      created_at, // 【修改】从 body 获取 created_at (对应前端传来的日期)
      project_title,
      project_address,
      terms_id,
      discount = 0,
      sections = []
    } = body;

    if (!id || !customer) return jsonError("Missing required fields", 400);

    // 检查是否存在
    const existing = await db.prepare("SELECT id FROM quotations WHERE id = ?").bind(id).first();
    if (!existing) return jsonError("Not found", 404);

    // 获取条款快照 (保持原逻辑)
    let termsSnapshot = null;
    if (terms_id) {
      const term = await db.prepare("SELECT content FROM quotation_terms WHERE id = ?").bind(terms_id).first();
      if (term) termsSnapshot = term.content;
    }

    /* ===============================
     * UPDATE MASTER (关键点：更新 created_at)
     * =============================== */
    await db.prepare(`
      UPDATE quotations
      SET
        customer = ?,
        created_at = ?,       -- 【核心】这里对应你数据库已有的列名
        project_title = ?,
        project_address = ?,
        terms_id = ?,
        terms_snapshot = ?,
        discount = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      customer,
      created_at || null,     // 绑定前端选的日期字符串 "YYYY-MM-DD"
      project_title || null,
      project_address || null,
      terms_id || null,
      termsSnapshot,
      discount,
      id
    ).run();

    /* ===============================
     * DELETE & RECREATE SECTIONS (保持原逻辑)
     * =============================== */
    await db.prepare("DELETE FROM quotation_items WHERE quotation_id = ?").bind(id).run();
    await db.prepare("DELETE FROM quotation_sections WHERE quotation_id = ?").bind(id).run();

    let subtotal = 0;
    for (let s = 0; s < sections.length; s++) {
      const sec = sections[s];
      const secRes = await db.prepare(
        "INSERT INTO quotation_sections (quotation_id, section_title, sort_order, created_at) VALUES (?, ?, ?, datetime('now'))"
      ).bind(id, sec.section_title, s).run();
      
      const sectionId = secRes.meta.last_row_id;

      for (let i = 0; i < (sec.items || []).length; i++) {
        const it = sec.items[i];
        const lineTotal = (Number(it.qty) || 0) * (Number(it.price) || 0);
        subtotal += lineTotal;

        await db.prepare(`
          INSERT INTO quotation_items (quotation_id, item_no, description, UOM, qty, unit_price, line_total, section_id, sort_order, is_priced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).bind(id, String(i+1), it.description, it.UOM, it.qty, it.price, lineTotal, sectionId, i).run();
      }
    }

    // 更新总价
    const grandTotal = Math.max(0, subtotal - discount);
    await db.prepare("UPDATE quotations SET subtotal = ?, grand_total = ? WHERE id = ?").bind(subtotal, grandTotal, id).run();

    return jsonOK({ success: true });

  } catch (err) {
    return jsonError(err.message, 500);
  }
}

// Helper 函数省略 (jsonOK, jsonError)
