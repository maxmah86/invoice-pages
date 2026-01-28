export async function onRequestGet({ request, env }) {

  /* ===== Auth (session_token) ===== */
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

  /* ===== Params ===== */
  const url = new URL(request.url);
  const month =
    url.searchParams.get("month") ||
    new Date().toISOString().slice(0, 7);

  /* ===== Salary (PAID only) ===== */
  const row = await env.DB.prepare(`
    SELECT IFNULL(SUM(net_salary), 0) AS total
    FROM salaries
    WHERE salary_month = ?
      AND status = 'PAID'
  `).bind(month).first();

  return Response.json({
    month,
    total: Number(row.total || 0)
  });
}
