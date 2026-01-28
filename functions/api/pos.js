export async function onRequestGet({ request, env }) {

  /* ===============================
     AUTH CHECK (session_token)
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" }
      }
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
      {
        status: 401,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  /* ===============================
     QUERY PO LIST
     =============================== */
  const result = await env.DB.prepare(`
    SELECT
      id,
      po_no,
      po_date,
      supplier_name,
      total,
      status
    FROM purchase_orders
    ORDER BY id DESC
    LIMIT 100
  `).all();

  /* ===============================
     RESPONSE
     =============================== */
  return new Response(
    JSON.stringify({
      viewer: {
        username: user.username,
        role: user.role
      },
      items: result.results
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }
  );
}
