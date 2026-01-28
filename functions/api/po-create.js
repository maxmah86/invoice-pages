export async function onRequestPost({ request, env }) {

  /* ===============================
     AUTH CHECK (session_token)
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

  if (!user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     ROLE CHECK (ADMIN ONLY)
     =============================== */
  if (user.role !== "admin") {
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     PARSE BODY
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
     CALCULATE SUBTOTAL & TOTAL
     =============================== */
  let subtotal = 0;
  for (const it of items) {
    const qty = Number(it.qty) || 0;
    const price = Number(it.price) || 0;
    subtotal += qty * price;
  }

  const total = subtotal;

  /* ===============================
     INSERT PO HEADER
     =============================== */
  const insertPO = await env.DB.prepare(`
    INSERT INTO purchase_orders (
      supplier_name,
      issued_by,
      delivery_address,
      delivery_date,
      delivery_time,
      notes,
      subtotal,
      total,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')
  `).bind(
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

  /* ===============================
     INSERT PO ITEMS
     =============================== */
  for (const it of items) {
    await env.DB.prepare(`
      INSERT INTO purchase_order_items (
        purchase_order_id,
        description,
        qty,
        unit_price
      ) VALUES (?, ?, ?, ?)
    `).bind(
      poId,
      it.description || "",
      Number(it.qty) || 0,
      Number(it.price) || 0
    ).run();
  }

  /* ===============================
     RESPONSE
     =============================== */
  return new Response(
    JSON.stringify({
      success: true,
      id: poId,
      created_by: user.username
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
