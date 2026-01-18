// functions/api/salaries.js
export async function onRequestGet({ request, env }) {
  const auth = await fetch(new URL("/api/auth-check", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" }
  });
  if (!auth.ok) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  if (!month) return new Response("Missing month", { status: 400 });

  const { results } = await env.DB.prepare(`
    SELECT
      s.id,
      e.name,
      s.base_salary,
      s.allowance,
      s.deduction,
      s.net_salary,
      s.status
    FROM salaries s
    JOIN employees e ON e.id = s.employee_id
    WHERE s.salary_month = ?
    ORDER BY e.name
  `).bind(month).all();

  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json" }
  });
}
