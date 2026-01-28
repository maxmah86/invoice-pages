export async function onRequest({ request, env }) {

  /* ===============================
     AUTH CHECK (session_token)
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(
      JSON.stringify({ loggedIn: false, error: "Unauthorized" }),
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
      JSON.stringify({ loggedIn: false, error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     READ invoice id
     =============================== */
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return new Response(
      JSON.stringify({ error: "Missing invoice id" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     FETCH invoice
     =============================== */
  const invoice = await env.DB.prepare(`
    SELECT
      id,
      invoice_no,
      customer,
      amount,
      status,
      created_at
    FROM invoices
    WHERE id = ?
  `).bind(id).first();

  if (!invoice) {
    return new Response(
      JSON.stringify({ error: "Invoice not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     FETCH items
     =============================== */
  const items = await env.DB.prepare(`
    SELECT
      description,
      qty,
      price
    FROM invoice_items
    WHERE invoice_id = ?
    ORDER BY id ASC
  `).bind(id).all();

  /* ===============================
     RESPONSE
     =============================== */
  return new Response(
    JSON.stringify({
      invoice,
      items: items.results || [],
      viewer: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );
}
