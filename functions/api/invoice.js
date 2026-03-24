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

  const { customer, items, project_id, invoice_date } = data;

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
     Use user-selected date if provided, else today
     =============================== */
  const targetDate = invoice_date && /^\d{4}-\d{2}-\d{2}$/.test(invoice_date)
    ? invoice_date
    : new Date().toISOString().slice(0, 10);

  const dateStr = targetDate.replace(/-/g, "");
  const prefix  = `INV-${dateStr}-`;

  // Use MAX to avoid duplicates on same date
  const maxRow = await env.DB.prepare(`
    SELECT MAX(invoice_no) AS max_no
    FROM invoices
    WHERE invoice_no LIKE ?
  `).bind(prefix + "%").first();

  let seq = 1;
  if (maxRow?.max_no) {
    const last = parseInt(maxRow.max_no.slice(-4), 10);
    if (!isNaN(last)) seq = last + 1;
  }

  const invoiceNo = `${prefix}${String(seq).padStart(4, "0")}`;

  // created_at uses the selected date at midnight
  const createdAt = targetDate + " 00:00:00";

  /* ===============================
     INSERT INVOICE
     =============================== */
  const inv = await env.DB.prepare(`
    INSERT INTO invoices
      (invoice_no, customer, amount, status, project_id, created_at)
    VALUES
      (?, ?, ?, 'UNPAID', ?, ?)
  `).bind(invoiceNo, customer, total, project_id || null, createdAt).run();

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
