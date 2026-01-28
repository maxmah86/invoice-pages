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

  const { id, supplier_name, items } = body;

  if (!id || !supplier_name || !Array.isArray(items)) {
    return new Response(
      JSON.stringify({ error: "Missing required fields" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     LOAD EXISTING PO
     =============================== */
  const po = await env.DB.prepare(`
    SELECT status
    FROM purchase_orders
    WHERE id = ?
  `).bind(id).first();

  if (!po) {
    return new Response(
      JSON.stringify({ error: "PO not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  if (po.status !== "OPEN") {
    return new Response(
      JSON.stringify({ error: "PO not editable" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     RE-CALCULATE TOTALS
     =============================== */
  let subtotal = 0;

  const normalizedItems = items.map(it => {
    const qty = Number(it.qty) || 0;
    const unit = Number(it.unit_price) || 0;
    const line = qty * unit;
    subtotal += line;

    return {
      description: it.description || "",
      qty,
      unit_price: unit,
      line_total: line
    };
  });

  const total = subtotal;

  /* ===============================
     UPDATE PO HEADER
     =============================== */
  await env.DB.prepare(`
    UPDATE purchase_orders
    SET supplier_name = ?,
        subtotal = ?,
        total = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    supplier_name,
    subtotal,
    total,
    id
  ).run();

  /* ===============================
     REPLACE ITEMS
     =============================== */
  await env.DB.prepare(`
    DELETE FROM purchase_order_items
    WHERE purchase_order_id = ?
  `).bind(id).run();

  const insertItem = env.DB.prepare(`
    INSERT INTO purchase_order_items
      (purchase_order_id, description, qty, unit_price, line_total)
    VALUES
      (?, ?, ?, ?, ?)
  `);

  for (const it of normalizedItems) {
    await insertItem.bind(
      id,
      it.description,
      it.qty,
      it.unit_price,
      it.line_total
    ).run();
  }

  /* ===============================
     RESPONSE
     =============================== */
  return new Response(
    JSON.stringify({
      success: true,
      updated_by: user.username
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
