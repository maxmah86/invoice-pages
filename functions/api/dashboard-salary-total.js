export async function onRequestGet({ request, env }) {
  const auth = await fetch(new URL("/api/auth-check", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" }
  });
  if (!auth.ok) return new Response("Unauthorized", { status: 401 });

  const month = new Date().toISOString().slice(0,7);

  const r = await env.DB.prepare(`
    SELECT IFNULL(SUM(net_salary),0) AS total
    FROM salaries
    WHERE salary_month=? AND status='PAID'
  `).bind(month).first();

  return new Response(JSON.stringify({ total: r.total }), {
    headers:{ "Content-Type":"application/json" }
  });
}
