export async function onRequestGet({ request, env }) {
  const auth = await fetch(new URL("/api/auth-check", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" }
  });
  if (!auth.ok) return new Response("Unauthorized", { status: 401 });

  const id = new URL(request.url).searchParams.get("id");

  const s = await env.DB.prepare(`
    SELECT
      s.salary_month,
      s.base_salary,
      s.allowance,
      s.deduction,
      s.net_salary,
      e.name
    FROM salaries s
    JOIN employees e ON e.id = s.employee_id
    WHERE s.id = ?
  `).bind(id).first();

  return new Response(JSON.stringify(s), {
    headers: { "Content-Type": "application/json" }
  });
}
