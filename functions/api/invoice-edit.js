export async function onRequestPost({ request, env }) {

  /* ===============================
     AUTH (session_token + role)
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  const user = await env.DB.prepare(`
    SELECT id, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  if (user.role !== "admin") {
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403 }
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
      { status: 400 }
    );
  }

  const { id, customer, items } = body || {};

  if (!id || !customer || !Array.isArray(items)) {
    return new Response(
      JSON.stringify({ error: "Invalid data" }),
      { status: 400 }
    );
  }

  /* ===============================
     CHECK INVOICE STATUS
     =============================== */
  const invoice = await env.DB.prepare(`
    SELECT status
    FROM invoices
    WHERE id = ?
  `).bind(id).first();

  if (!invoice || invoice.status !== "UNPAID") {
    return new Response(
      JSON.stringify({ error: "Invoice cannot be edited" }),
      { status: 400 }
    );
  }

  /* ===============================
     RE-CALCULATE TOTAL
     =============================== */
  let total = 0;
  for (const it of items) {
    if (!it.description || it.qty <= 0 || it.price < 0) continue;
    total += Number(it.qty) * Number(it.price);
  }

  /* ===============================
     UPDATE INVOICE
     =============================== */
  await env.DB.prepare(`
    UPDATE invoices
    SET customer = ?, amount = ?
    WHERE id = ?
  `).bind(customer, total, id).run();

  /* ===============================
     REPLACE ITEMS
     =============================== */
  await env.DB.prepare(`
    DELETE FROM invoice_items
    WHERE invoice_id = ?
  `).bind(id).run();

  for (const it of items) {
    if (!it.description || it.qty <= 0) continue;

    await env.DB.prepare(`
      INSERT INTO invoice_items
        (invoice_id, description, qty, price)
      VALUES (?, ?, ?, ?)
    `).bind(
      id,
      it.description,
      it.qty,
      it.price
    ).run();
  }

  return new Response(
    JSON.stringify({
      success: true,
      updated_by: user.id,
      role: user.role
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
