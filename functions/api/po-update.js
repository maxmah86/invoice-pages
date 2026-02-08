export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;

  // 1. 管理员权限检查 (参考你的认证逻辑)
  const authRes = await fetch(new URL('/api/auth-check', request.url), {
    headers: { Cookie: request.headers.get('Cookie') || '' }
  });
  const auth = await authRes.json();
  if (!auth.loggedIn || auth.role !== 'admin') return jsonError('Permission denied', 403);

  try {
    const body = await request.json();
    const {
      id,
      supplier_name,
      po_date,
      issued_by,
      delivery_address,
      delivery_date,
      delivery_time,
      notes,
      items = []
    } = body;

    if (!id) return jsonError('PO ID required', 400);

    // 计算新的总额
    const subtotal = items.reduce((sum, it) => sum + (Number(it.qty) * Number(it.price)), 0);

    const statements = [];

    // 2. 更新主表 purchase_orders
    statements.push(db.prepare(`
      UPDATE purchase_orders 
      SET supplier_name = ?, po_date = ?, issued_by = ?, delivery_address = ?, 
          delivery_date = ?, delivery_time = ?, notes = ?, subtotal = ?, total = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(supplier_name, po_date, issued_by, delivery_address, delivery_date, delivery_time, notes, subtotal, subtotal, id));

    // 3. 删除旧项目
    statements.push(db.prepare(`DELETE FROM purchase_order_items WHERE purchase_order_id = ?`).bind(id));

    // 4. 插入新项目 (匹配你定义的字段: description, qty, unit_price, line_total)
    for (const it of items) {
      const qty = Number(it.qty) || 0;
      const price = Number(it.price) || 0;
      const lineTotal = qty * price;
      
      statements.push(db.prepare(`
        INSERT INTO purchase_order_items (purchase_order_id, description, qty, unit_price, line_total)
        VALUES (?, ?, ?, ?, ?)
      `).bind(id, it.description, qty, price, lineTotal));
    }

    await db.batch(statements);
    return jsonOK({ id });

  } catch (err) {
    return jsonError(err.message, 500);
  }
}

function jsonOK(data) { return new Response(JSON.stringify({ success: true, data }), { headers: { 'Content-Type': 'application/json' } }); }
function jsonError(msg, status = 400) { return new Response(JSON.stringify({ success: false, error: msg }), { status, headers: { 'Content-Type': 'application/json' } }); }
