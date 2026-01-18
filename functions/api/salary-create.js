export async function onRequestPost({ request, env }) {

  const auth = await fetch(new URL("/api/auth-check", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" }
  });
  if (!auth.ok) return new Response("Unauthorized", { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { salary_month } = body;
  if (!salary_month) {
    return new Response("Missing salary_month", { status: 400 });
  }

  const { results: employees } = await env.DB.prepare(`
    SELECT id, base_salary
    FROM employees
    WHERE status = 'ACTIVE'
  `).all();

  for (const e of employees) {
    const exists = await env.DB.prepare(`
      SELECT 1 FROM salaries
      WHERE employee_id = ? AND salary_month = ?
    `).bind(e.id, salary_month).first();

    if (exists) continue;

    await env.DB.prepare(`
      INSERT INTO salaries
        (employee_id, salary_month, base_salary, allowance, deduction, net_salary, status)
      VALUES
        (?, ?, ?, 0, 0, ?, 'DRAFT')
    `).bind(
      e.id,
      salary_month,
      e.base_salary,
      e.base_salary
    ).run();
  }

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { "Content-Type": "application/json" } }
  );
}
