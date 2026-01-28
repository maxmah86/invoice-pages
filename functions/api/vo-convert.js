export async function onRequestPost({ request, env }) {

  /* ===============================
     AUTH CHECK (session_token)
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = await env.DB.prepare(`
    SELECT id, username, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  /* ===============================
     PARSE BODY
     =============================== */
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { vo_id } = body;
  if (!vo_id) {
    return new Response("Missing vo_id", { status: 400 });
  }

  /* ===============================
     LOAD VO
     =============================== */
  const vo = await env.DB.prepare(`
    SELECT id, title, customer, status
    FROM variation_orders
    WHERE id = ?
  `).bind(vo_id).first();

  if (!vo) {
    return new Response("VO not found", { status: 404 });
  }

  if (vo.status !== "APPROVED") {
    return new Response("VO not invoiceable", { status: 400 });
  }

  /* ===============================
     PREVENT DUPLICATE INVOICE
     =============================== */
  const exists = await env.DB.prepare(`
    SELECT id
    FROM invoices
    WHERE source_type = 'VO'
      AND source_id = ?
  `).bind(vo_id).first();

  if (exists) {
    return new Response(
      JSON.stringify({ error: "VO already invoiced" }),
      { status: 400 }
    );
  }

  /* ===============================
     LOAD VO ITEMS
     =============================== */
  const items = await env.DB.prepare(`
    SELECT description, qty, unit_price
    FROM variation_order_items
    WHERE variation_order_id = ?
  `).bind(vo_id).all();

  if (!items.results.length) {
    return new Response("VO has no items", { status: 400 });
  }

  let total = 0;
  for (const it of items.results) {
    total += Number(it.qty) * Number(it.unit_price);
  }

  /* ===============================
     GENERATE INVOICE NO
     =============================== */
  const d = new Date();
  const date = d.toISOString().slice(0,10).replace(/-/g,"");

  const cnt = await env.DB.prepare(`
    SELECT COUNT(*) AS c
    FROM invoices
    WHERE date(created_at) = date('now')
  `).first();

  const invoice_no = `INV-${date}-${String(cnt.c + 1).padStart(4,"0")}`;

  /* ===============================
     INSERT INVOICE
     =============================== */
  const inv = await env.DB.prepare(`
    INSERT INTO invoices (
      invoice_no,
      customer,
      amount,
      status,
      created_at,
      source_type,
      source_id
    ) VALUES (?, ?, ?, 'UNPAID', datetime('now'), 'VO', ?)
  `).bind(
    invoice_no,
    vo.customer || "VO Customer",
    total,
    vo_id
  ).run();

  const invoice_id = inv.meta.last_row_id;

  /* ===============================
     INSERT INVOICE ITEMS
     =============================== */
  const stmt = env.DB.prepare(`
    INSERT INTO invoice_items (
      invoice_id,
      description,
      qty,
      price
    ) VALUES (?, ?, ?, ?)
  `);

  for (const it of items.results) {
    await stmt.bind(
      invoice_id,
      it.description,
      it.qty,
      it.unit_price
    ).run();
  }

  /* ===============================
     UPDATE VO STATUS
     =============================== */
  await env.DB.prepare(`
    UPDATE variation_orders
    SET status = 'INVOICED',
        invoice_id = ?
    WHERE id = ?
  `).bind(invoice_id, vo_id).run();

  /* ===============================
     RESPONSE
     =============================== */
  return Response.json({
    success: true,
    invoice_id,
    invoice_no,
    converted_by: user.username
  });
}
