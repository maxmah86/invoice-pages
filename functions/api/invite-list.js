export async function onRequestGet({ request, env }) {

  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];
  if (!token) return new Response("Unauthorized", { status: 401 });

  const user = await env.DB.prepare(`
    SELECT role FROM users WHERE session_token = ?
  `).bind(token).first();

  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const rows = await env.DB.prepare(`
    SELECT
      id,
      code,
      role,
      is_used,
      expires_at,
      used_at,
      created_at
    FROM invite_codes
    ORDER BY created_at DESC
  `).all();

  return Response.json(rows.results);
}
