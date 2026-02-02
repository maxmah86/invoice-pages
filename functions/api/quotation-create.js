export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;

  // ===== 1. Admin Auth =====
  const authRes = await fetch(new URL('/api/auth-check', request.url), {
    headers: { Cookie: request.headers.get('Cookie') || '' }
  });
  const auth = await authRes.json();
  if (!auth.loggedIn || auth.role !== 'admin') return jsonError('Permission denied', 403);

  try {
    const body = await request.json();
    const {
      customer,
      project_title,
      project_address,
      terms_id,
      discount = 0,
      sections = [] // 确保前端传的是 sections 数组
    } = body;

    if (!customer) return jsonError('Customer required', 400);

    // 生成单号
    const quotationNo = 'QT' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + Math.floor(1000 + Math.random() * 9000);

    // 获取条款快照
    let termsSnapshot = null;
    if (terms_id) {
      const term = await db.prepare(`SELECT content FROM quotation_terms WHERE id = ? AND is_active = 1`).bind(terms_id).first();
      if (term) termsSnapshot = term.content;
    }

    /* ===============================
     * 核心：执行事务级插入 (D1 Batch)
     * =============================== */
    // 1. 先插主表
    const qRes = await db.prepare(`
      INSERT INTO quotations (quotation_no, customer, project_title, project_address, terms_id, terms_snapshot, discount, subtotal, grand_total, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, datetime('now'))
    `).bind(quotationNo, customer, project_title, project_address, terms_id, termsSnapshot, discount).run();

    const quotationId = qRes.meta.last_row_id;
    let subtotal = 0;

    // 2. 循环插入 Section 和 Items
    for (let s = 0; s < sections.length; s++) {
      const sec = sections[s];
      const secRes = await db.prepare(`
        INSERT INTO quotation_sections (quotation_id, section_title, sort_order, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `).bind(quotationId, sec.section_title || '', s).run();
      
      const sectionId = secRes.meta.last_row_id;

      for (let i = 0; i < (sec.items || []).length; i++) {
        const it = sec.items[i];
        const qty = Number(it.qty) || 0;
        const price = Number(it.price || it.unit_price) || 0;
        const lineTotal = qty * price;
        subtotal += lineTotal;

        await db.prepare(`
          INSERT INTO quotation_items (quotation_id, section_id, item_no, description, UOM, qty, unit_price, line_total, sort_order, is_priced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).bind(quotationId, sectionId, String(i + 1), it.description, it.UOM, qty, price, lineTotal, i).run();
      }
    }

    // 3. 更新总价
    const grandTotal = Math.max(0, subtotal - discount);
    await db.prepare(`UPDATE quotations SET subtotal = ?, grand_total = ? WHERE id = ?`)
      .bind(subtotal, grandTotal, quotationId).run();

    return jsonOK({ id: quotationId, quotation_no: quotationNo });

  } catch (err) {
    return jsonError(err.message, 500);
  }
}

function jsonOK(data) { return new Response(JSON.stringify({ success:true, data }), { headers:{'Content-Type':'application/json'} }); }
function jsonError(msg, status=400) { return new Response(JSON.stringify({ success:false, error:msg }), { status, headers:{'Content-Type':'application/json'} }); }
