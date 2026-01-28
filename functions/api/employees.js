export async function onRequestGet({ request, env }) {

  /* ===============================
     AUTH (session_token + role)
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

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  /* ===============================
     QUERY EMPLOYEES
     =============================== */
  const { results } = await env.DB.prepare(`
    SELECT
      id,
      name,
      role,
      base_salary,
      status
    FROM employees
    ORDER BY status = 'ACTIVE' DESC, name
  `).all();

  return Response.json(results);
}
