export async function onRequestPost({ request, env }) {
  /* ===============================
     1. 权限检查
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const user = await env.DB.prepare(`
    SELECT id, username, role FROM users WHERE session_token = ?
  `).bind(token).first();

  // 允许 admin 或 user 角色创建 PO，你可以根据需求调整
  if (!user) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  /* ===============================
     2. 解析并校验数据
     =============================== */
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const {
    supplier_name,
    project_id,
    po_date,
    issued_by,
    delivery_address,
    delivery_date,
    delivery_time,
    notes,
    items
  } = body;

  if (!supplier_name || !items || items.length === 0) {
    return new Response(
      JSON.stringify({ error: "Supplier Name and Items are required" }),
      { status: 400 }
    );
  }

  /* ===============================
     3. 生成 PO 编号 (POYYYYMMDDXXXX)
     =============================== */
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `PO${today}`;

  const maxRow = await env.DB.prepare(`
    SELECT MAX(po_no) AS max_no FROM purchase_orders WHERE po_no LIKE ?
  `).bind(prefix + "%").first();

  let seq = 1;
  if (maxRow?.max_no) {
    // 假设编号格式为 PO202603270001
    const lastSeq = parseInt(maxRow.max_no.slice(-4), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  const po_no = `${prefix}${String(seq).padStart(4, "0")}`;

  /* ===============================
     4. 执行数据库插入 (事务)
     =============================== */
  try {
    // 计算总额
    const total_amount = items.reduce((sum, i) => sum + (Number(i.qty) * Number(i.price)), 0);

    // 1. 插入主表 purchase_orders
    const poResult = await env.DB.prepare(`
      INSERT INTO purchase_orders (
        po_no, po_date, supplier_name, project_id, issued_by, 
        delivery_address, delivery_date, delivery_time, 
        notes, total, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', datetime('now'))
    `).bind(
      po_no,
      po_date || new Date().toISOString().slice(0, 10),
      supplier_name,
      project_id ? Number(project_id) : null,
      issued_by || user.username,
      delivery_address || "",
      delivery_date || null,
      delivery_time || "",
      notes || "",
      total_amount
    ).run();

    const newPoId = poResult.meta.last_row_id;

    // 2. 批量插入明细表 purchase_order_items
    const itemStatements = items.map(item => {
      const qty = Number(item.qty) || 0;
      const price = Number(item.price) || 0;
      const lineTotal = qty * price;

      return env.DB.prepare(`
        INSERT INTO purchase_order_items (
          purchase_order_id, description, qty, unit_price, line_total
        ) VALUES (?, ?, ?, ?, ?)
      `).bind(newPoId, item.description, qty, price, lineTotal);
    });

    // 使用 batch 确保原子性
    await env.DB.batch(itemStatements);

    return new Response(JSON.stringify({ success: true, id: newPoId, po_no }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Database error: " + err.message }),
      { status: 500 }
    );
  }
}
