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
    SELECT id, title, customer, status, project_id
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

  /* ===============================
     GET CUSTOMER NAME from linked docs
     =============================== */
  let customerName = "VO Customer";

  // Try project → quotation → invoice for customer name
  if (vo.project_id) {
    const proj = await env.DB.prepare(
      `SELECT client_name FROM projects WHERE id = ?`
    ).bind(vo.project_id).first();
    if (proj?.client_name) customerName = proj.client_name;
  }

  if (customerName === "VO Customer" && vo.quotation_id) {  // fallback: quotation
    // vo.quotation_id exists but we need to query it — body has vo_id only, use vo object
  }

  // Try quotation_id linked on the VO
  const voFull = await env.DB.prepare(
    `SELECT quotation_id, invoice_id FROM variation_orders WHERE id = ?`
  ).bind(vo_id).first();

  if (customerName === "VO Customer" && voFull?.quotation_id) {
    const quot = await env.DB.prepare(
      `SELECT customer FROM quotations WHERE id = ?`
    ).bind(voFull.quotation_id).first();
    if (quot?.customer) customerName = quot.customer;
  }

  if (customerName === "VO Customer" && voFull?.invoice_id) {
    const inv0 = await env.DB.prepare(
      `SELECT customer FROM invoices WHERE id = ?`
    ).bind(voFull.invoice_id).first();
    if (inv0?.customer) customerName = inv0.customer;
  }

  let total = 0;
  for (const it of items.results) {
    total += Number(it.qty) * Number(it.unit_price);
  }
     =============================== */
  const d = new Date();
  const date = d.toISOString().slice(0,10).replace(/-/g,"");
  const invPrefix = `INV-${date}-`;

  const maxInv = await env.DB.prepare(`
    SELECT MAX(invoice_no) AS max_no FROM invoices WHERE invoice_no LIKE ?
  `).bind(invPrefix + "%").first();

  let invSeq = 1;
  if (maxInv?.max_no) {
    const last = parseInt(maxInv.max_no.slice(-4), 10);
    if (!isNaN(last)) invSeq = last + 1;
  }

  const invoice_no = `${invPrefix}${String(invSeq).padStart(4,"0")}`;

  /* ===============================
     INSERT INVOICE
     =============================== */
  const inv = await env.DB.prepare(`
    INSERT INTO invoices (
      invoice_no,
      customer,
      amount,
      status,
      project_id,
      created_at,
      source_type,
      source_id
    ) VALUES (?, ?, ?, 'UNPAID', ?, datetime('now'), 'VO', ?)
  `).bind(
    invoice_no,
    customerName,
    total,
    vo.project_id || null,
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
