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
  let data;
  try {
    data = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { customer, items } = data;

  if (!customer || !Array.isArray(items) || items.length === 0) {
    return new Response(
      JSON.stringify({ error: "Invalid data" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     CALCULATE TOTAL
     =============================== */
  const total = items.reduce(
    (sum, it) =>
      sum + (Number(it.qty) || 0) * (Number(it.price) || 0),
    0
  );

  /* ===============================
     GENERATE INVOICE NO
     =============================== */
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const dateStr = `${y}${m}${d}`;

  const countRow = await env.DB.prepare(`
    SELECT COUNT(*) AS cnt
    FROM invoices
    WHERE date(created_at) = date('now')
  `).first();

  const seq = String((countRow.cnt || 0) + 1).padStart(4, "0");
  const invoiceNo = `INV-${dateStr}-${seq}`;

  /* ===============================
     INSERT INVOICE
     =============================== */
  const inv = await env.DB.prepare(`
    INSERT INTO invoices
      (invoice_no, customer, amount, status, created_at)
    VALUES
      (?, ?, ?, 'UNPAID', datetime('now'))
  `).bind(invoiceNo, customer, total).run();

  const invoiceId = inv.meta.last_row_id;

  /* ===============================
     INSERT ITEMS
     =============================== */
  for (const it of items) {
    await env.DB.prepare(`
      INSERT INTO invoice_items
        (invoice_id, description, qty, price)
      VALUES
        (?, ?, ?, ?)
    `).bind(
      invoiceId,
      it.description,
      Number(it.qty),
      Number(it.price)
    ).run();
  }

  return new Response(
    JSON.stringify({
      success: true,
      invoice_id: invoiceId,
      invoice_no: invoiceNo,
      created_by: user.username
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
