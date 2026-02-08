export async function onRequestPost({ request, env }) {

  /* ===============================
     1. 身份验证 (AUTH CHECK)
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const user = await env.DB.prepare(`
    SELECT id, username, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user || user.role !== "admin") {
    return new Response(
      JSON.stringify({ error: user ? "Forbidden" : "Unauthorized" }),
      { status: user ? 403 : 401, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     2. 解析并验证数据
     =============================== */
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const {
    supplier_name,
    po_date, // 用户前端选择的日期
    issued_by,
    delivery_address,
    delivery_date,
    delivery_time,
    notes,
    items
  } = body;

  if (!supplier_name || !Array.isArray(items) || items.length === 0) {
    return new Response(
      JSON.stringify({ error: "Invalid data" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     3. 生成对齐日期的 PO 单号 (Core Logic)
     =============================== */
  // 如果用户没选日期，则默认为今天 (YYYY-MM-DD)
  const targetDate = po_date || new Date().toISOString().split('T')[0];
  
  // 提取日期数字部分 (例如 2025-05-20 -> 20250520)
  const dateStr = targetDate.replace(/-/g, "");
  
  // 生成随机 4 位数防止同一天内单号冲突
  const randomSuffix = Math.floor(1000 + Math.random() * 9000); 
  
  // 最终单号：PO202505209999
  const customPoNo = `PO${dateStr}${randomSuffix}`;

  /* ===============================
     4. 计算金额
     =============================== */
  let subtotal = 0;
  for (const it of items) {
    const qty = Number(it.qty) || 0;
    const price = Number(it.price) || 0;
    subtotal += qty * price;
  }
  const total = subtotal;

  /* ===============================
     5. 写入数据库 (使用事务思路)
     =============================== */
  try {
    // 插入 PO 主表
    const insertPO = await env.DB.prepare(`
      INSERT INTO purchase_orders (
        po_no,           -- 显式插入对齐日期的单号
        po_date,         -- 用户选择的日期
        supplier_name,
        issued_by,
        delivery_address,
        delivery_date,
        delivery_time,
        notes,
        subtotal,
        total,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')
    `).bind(
      customPoNo,
      targetDate,
      supplier_name,
      issued_by || user.username,
      delivery_address || "",
      delivery_date || "",
      delivery_time || "",
      notes || "",
      subtotal,
      total
    ).run();

    const poId = insertPO.meta.last_row_id;

    // 插入 PO 明细表
    for (const it of items) {
      await env.DB.prepare(`
        INSERT INTO purchase_order_items (
          purchase_order_id,
          description,
          qty,
          unit_price,
          line_total
        ) VALUES (?, ?, ?, ?, ?)
      `).bind(
        poId,
        it.description || "",
        Number(it.qty) || 0,
        Number(it.price) || 0,
        (Number(it.qty) || 0) * (Number(it.price) || 0)
      ).run();
    }

    return new Response(
      JSON.stringify({
        success: true,
        po_no: customPoNo,
        id: poId
      }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Database error: " + err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
