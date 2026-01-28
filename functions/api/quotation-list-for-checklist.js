export async function onRequestGet({ request, env }) {

  /* ===============================
     AUTH CHECK (ADMIN ONLY)
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = await env.DB.prepare(`
    SELECT id, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  /* ===============================
     QUERY ACCEPTED QUOTATIONS
     =============================== */
  const rows = await env.DB.prepare(`
    SELECT
      id,
      quotation_no,
      customer
    FROM quotations
    WHERE status = 'ACCEPTED'
    ORDER BY created_at DESC
  `).all();

  return Response.json(rows.results || []);
}
