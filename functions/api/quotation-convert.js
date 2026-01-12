export async function onRequestPost({ request, env }) {
  // 1️⃣ auth
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("auth=ok")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2️⃣ input
  const { quotation_id } = await request.json();
  if (!quotation_id) {
    return new Response(JSON.stringify({ error: "Missing quotation_id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3️⃣ load quotation
  const q = await env.DB.prepare(
    `SELECT * FROM quotations WHERE id = ? AND status = 'OPEN'`
  )
    .bind(quotation_id)
    .first();

  if (!q) {
    return new Response(JSON.stringify({ error: "Quotation not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 4️⃣ create invoice_no
  const invoiceNo = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 10000)}`;

  // 5️⃣ insert invoice (⚠️完全匹配你的表)
  await env.DB.prepare(
    `
    INSERT INTO invoices
    (invoice_no, customer, amount, status, created_at)
    VALUES (?, ?, ?, 'UNPAID', datetime('now'))
    `
  )
    .bind(invoiceNo, q.customer, q.amount)
    .run();

  // 6️⃣ update quotation
  await env.DB.prepare(
    `UPDATE quotations SET status = 'ACCEPTED' WHERE id = ?`
  )
    .bind(quotation_id)
    .run();

  return new Response(
    JSON.stringify({
      success: true,
      invoice_no: invoiceNo,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
