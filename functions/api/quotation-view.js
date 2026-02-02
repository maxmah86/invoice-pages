export async function onRequestGet(context) {
  const { request, env } = context;
  const db = env.DB;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) return jsonError('Quotation ID is required', 400);

  // ===== 1. Admin Auth (严格同步) =====
  const authRes = await fetch(new URL('/api/auth-check', request.url), {
    headers: { Cookie: request.headers.get('Cookie') || '' }
  });
  const auth = await authRes.json();

  if (!auth.loggedIn || auth.role !== 'admin') {
    return jsonError('Permission denied', 403);
  }

  try {
    /* ===============================
     * 2. 对应 INSERT INTO quotations 的查询
     * =============================== */
    const quotation = await db.prepare(`
      SELECT 
        id,
        quotation_no,
        customer,
        project_title,
        project_address,
        terms_id,
        terms_snapshot,
        discount,
        subtotal,
        grand_total,
        created_at
      FROM quotations 
      WHERE id = ?
    `).bind(id).first();

    if (!quotation) return jsonError('Quotation not found', 404);

    /* ===============================
     * 3. 对应 INSERT INTO quotation_sections 的查询
     * =============================== */
    const { results: sections } = await db.prepare(`
      SELECT id, section_title, sort_order 
      FROM quotation_sections 
      WHERE quotation_id = ? 
      ORDER BY sort_order ASC
    `).bind(id).all();

    /* ===============================
     * 4. 对应 INSERT INTO quotation_items 的查询
     * =============================== */
    const { results: items } = await db.prepare(`
      SELECT 
        id,
        section_id,
        item_no,
        description,
        UOM,
        qty,
        unit_price,
        line_total,
        sort_order,
        is_priced
      FROM quotation_items 
      WHERE quotation_id = ? 
      ORDER BY sort_order ASC
    `).bind(id).all();

    /* ===============================
     * 5. 数据逻辑组装 (与 create.js 输入结构对应)
     * =============================== */
    const sectionsWithItems = sections.map(sec => ({
      ...sec,
      // 这里的 items 数组就是你 create.js 里 sections[s].items 的来源
      items: items.filter(item => item.section_id === sec.id)
    }));

    return jsonOK({
      ...quotation,
      sections: sectionsWithItems
    });

  } catch (err) {
    console.error(err);
    return jsonError(err.message || 'Fetch quotation failed', 500);
  }
}

/* ===== helpers ===== */
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
