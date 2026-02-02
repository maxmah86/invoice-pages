export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;

  /* ===============================
   * 1. Admin Auth
   * =============================== */
  const authRes = await fetch(new URL('/api/auth-check', request.url), {
    headers: { Cookie: request.headers.get('Cookie') || '' }
  });
  const auth = await authRes.json();

  if (!auth.loggedIn || auth.role !== 'admin') {
    return jsonError('Permission denied', 403);
  }

  try {
    const body = await request.json();
    const { quotation_id } = body;

    if (!quotation_id) {
      return jsonError('quotation_id required', 400);
    }

    /* ===============================
     * 2. 检查 quotation 是否存在
     * =============================== */
    const quotation = await db.prepare(
      `SELECT id FROM quotations WHERE id = ?`
    ).bind(quotation_id).first();

    if (!quotation) {
      return jsonError('Quotation not found', 404);
    }

    /* ===============================
     * 3. 创建 work_checklist
     * =============================== */
    const wcRes = await db.prepare(`
      INSERT INTO work_checklists (quotation_id, status, created_at)
      VALUES (?, 'NOT_STARTED', datetime('now'))
    `).bind(quotation_id).run();

    const workChecklistId = wcRes.meta.last_row_id;

    /* ===============================
     * 4. 读取 sections
     * =============================== */
    const sectionsRes = await db.prepare(`
      SELECT id, section_title
      FROM quotation_sections
      WHERE quotation_id = ?
      ORDER BY sort_order
    `).bind(quotation_id).all();

    /* ===============================
     * 5. 循环 sections → items
     * =============================== */
    for (const sec of sectionsRes.results || []) {

      // 5.1 写入 section title 作为 checklist item
      if (sec.section_title) {
        await db.prepare(`
          INSERT INTO work_checklist_items (
            work_checklist_id,
            description,
            status,
            created_at
          )
          VALUES (?, ?, 'NOT_STARTED', datetime('now'))
        `).bind(
          workChecklistId,
          sec.section_title
        ).run();
      }

      // 5.2 读取该 section 下的 items
      const itemsRes = await db.prepare(`
        SELECT description, UOM, qty
        FROM quotation_items
        WHERE quotation_id = ?
          AND section_id = ?
        ORDER BY sort_order
      `).bind(quotation_id, sec.id).all();

      for (const it of itemsRes.results || []) {
        if (!it.description) continue;

        // 只拼你指定的字段
        const descParts = [];
        descParts.push(it.description);

        if (it.UOM) descParts.push(`UOM: ${it.UOM}`);
        if (it.qty !== null && it.qty !== undefined)
          descParts.push(`Qty: ${it.qty}`);

        const finalDescription = descParts.join(' | ');

        await db.prepare(`
          INSERT INTO work_checklist_items (
            work_checklist_id,
            description,
            status,
            created_at
          )
          VALUES (?, ?, 'NOT_STARTED', datetime('now'))
        `).bind(
          workChecklistId,
          finalDescription
        ).run();
      }
    }

    return jsonOK({
      work_checklist_id: workChecklistId
    });

  } catch (err) {
    console.error(err);
    return jsonError(err.message || 'Create work checklist failed', 500);
  }
}

/* ===============================
 * Helpers
 * =============================== */
function jsonOK(data) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}