export async function onRequestPost({ request, env }) {

  /* ===== AUTH ===== */
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

  /* ===== ADMIN ONLY ===== */
  if (user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  /* ===== BODY ===== */
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { quotation_id } = body;
  if (!quotation_id) {
    return new Response("Missing quotation_id", { status: 400 });
  }

  /* ===== LOAD QUOTATION ===== */
  const quotation = await env.DB.prepare(`
    SELECT id, quotation_no, customer, amount, status
    FROM quotations
    WHERE id = ?
  `).bind(quotation_id).first();

  if (!quotation || quotation.status !== "OPEN") {
    return new Response("Quotation not found or not OPEN", { status: 400 });
  }

  /* ===== LOAD ITEMS ===== */
  const items = await env.DB.prepare(`
    SELECT description, qty, price
    FROM quotation_items
    WHERE quotation_id = ?
  `).bind(quotation_id).all();

  if (!items.results.length) {
    return new Response("Quotation has no items", { status: 400 });
  }

  /* ===== GENERATE INVOICE NO ===== */
  const now = new Date();
  const dateStr = now.toISOString().slice(0,10).replace(/-/g,"");

  const cnt = await env.DB.prepare(`
    SELECT COUNT(*) AS c
    FROM invoices
    WHERE date(created_at) = date('now')
  `).first();

  const invoice_no = `INV-${dateStr}-${String(cnt.c + 1).padStart(4,"0")}`;

  /* ===== INSERT INVOICE (⚠️已移除 source_type/source_id) ===== */
  const inv = await env.DB.prepare(`
    INSERT INTO invoices (
      invoice_no,
      customer,
      amount,
      status,
      created_at
    ) VALUES (?, ?, ?, 'UNPAID', datetime('now'))
  `).bind(
    invoice_no,
    quotation.customer,
    quotation.amount
  ).run();

  const invoice_id = inv.meta.last_row_id;

  /* ===== INSERT ITEMS ===== */
  for (const it of items.results) {
    await env.DB.prepare(`
      INSERT INTO invoice_items (
        invoice_id,
        description,
        qty,
        price
      ) VALUES (?, ?, ?, ?)
    `).bind(
      invoice_id,
      it.description,
      it.qty,
      it.price
    ).run();
  }

  /* ===== UPDATE QUOTATION ===== */
  await env.DB.prepare(`
    UPDATE quotations
    SET status = 'ACCEPTED'
    WHERE id = ?
  `).bind(quotation_id).run();

  /* ===== OK ===== */
  return Response.json({
    success: true,
    invoice_id,
    invoice_no,
    converted_by: user.username
  });
}
