export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;

  // ===== 1. Admin Auth (保持不变) =====
  const authRes = await fetch(new URL('/api/auth-check', request.url), {
    headers: { Cookie: request.headers.get('Cookie') || '' }
  });
  const auth = await authRes.json();
  if (!auth.loggedIn || auth.role !== 'admin') return jsonError('Permission denied', 403);

  try {
    const body = await request.json();
    const {
      customer,
      created_at,      // 【核心升级】接收前端选择的日期 (YYYY-MM-DD)
      project_id,
      project_title,
      project_address,
      terms_id,
      discount = 0,
      sections = []
    } = body;

    // 基础验证
    if (!customer) return jsonError('Customer name is required', 400);
    if (!created_at) return jsonError('Quotation date is required', 400);

    // 生成单号 (保持你的逻辑)
    const quotationNo = 'QT' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + Math.floor(1000 + Math.random() * 9000);

    // 获取条款快照
    let termsSnapshot = null;
    if (terms_id) {
      const term = await db.prepare(`SELECT content FROM quotation_terms WHERE id = ? AND is_active = 1`).bind(terms_id).first();
      if (term) termsSnapshot = term.content;
    }

    /* =========================================================
     * 1. 插入主表 (Master Table)
     * ========================================================= */
    // 注意：我们将前端传来的 created_at 存入数据库的 created_at 字段
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
      created_at // 绑定前端选择的日期
    ).run();

    const quotationId = qRes.meta.last_row_id;
    let runningSubtotal = 0;

    /* =========================================================
     * 2. 循环插入 Section 和 Items
     * ========================================================= */
    for (let s = 0; s < sections.length; s++) {
      const sec = sections[s];
      
      // 插入 Section
      const secRes = await db.prepare(`
        INSERT INTO quotation_sections (quotation_id, section_title, sort_order, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `).bind(quotationId, sec.section_title || '', s).run();
      
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
            quotation_id, section_id, item_no, description, UOM, 
            qty, unit_price, line_total, sort_order, is_priced
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).bind(
          quotationId, 
          sectionId, 
          String(i + 1), 
          it.description || "", 
          it.UOM || "", 
          qty, 
          price, 
          lineTotal, 
          i
        ).run();
      }
    }

    /* =========================================================
     * 3. 更新总价 (Final Totals)
     * ========================================================= */
    const finalGrandTotal = Math.max(0, runningSubtotal - Number(discount));
    
    await db.prepare(`
      UPDATE quotations 
      SET subtotal = ?, grand_total = ? 
      WHERE id = ?
    `).bind(runningSubtotal, finalGrandTotal, quotationId).run();

    return jsonOK({ id: quotationId, quotation_no: quotationNo });

  } catch (err) {
    console.error("Create Error:", err);
    return jsonError(err.message || "Failed to create quotation", 500);
  }
}

/* =========================================================
 * 辅助函数 (Helpers)
 * ========================================================= */
function jsonOK(data) { 
  return new Response(JSON.stringify({ success:true, data }), { headers:{'Content-Type':'application/json'} }); 
}

function jsonError(msg, status=400) { 
  return new Response(JSON.stringify({ success:false, error:msg }), { status, headers:{'Content-Type':'application/json'} }); 
}
