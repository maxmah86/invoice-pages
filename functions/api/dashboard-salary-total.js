export async function onRequestGet({ request, env }) {

  /* ===============================
     AUTH CHECK
     =============================== */
  const auth = await fetch(new URL("/api/auth-check", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" }
export async function onRequestGet({ request, env }) {
  const auth = await fetch(new URL("/api/auth-check", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" }
  });
  if (!auth.ok) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const period = url.searchParams.get("period") === "year" ? "year" : "month";
  const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const year = url.searchParams.get("year") || new Date().getFullYear().toString();

  const salaryRow = period === "year"
export async function onRequestGet({ request, env }) {
  const auth = await fetch(new URL("/api/auth-check", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" }
  });
  if (!auth.ok) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const period = url.searchParams.get("period") === "year" ? "year" : "month";
  const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const year = url.searchParams.get("year") || new Date().getFullYear().toString();

  const salaryRow = period === "year"
    ? await env.DB.prepare(`
        SELECT IFNULL(SUM(net_salary), 0) AS total
        FROM salaries
        WHERE substr(salary_month, 1, 4) = ?
          AND status = 'PAID'
      `).bind(year).first()
    : await env.DB.prepare(`
        SELECT IFNULL(SUM(net_salary), 0) AS total
        FROM salaries
        WHERE salary_month = ?
          AND status = 'PAID'
      `).bind(month).first();

  const dailyRow = period === "year"
    ? await env.DB.prepare(`
        SELECT IFNULL(SUM(amount), 0) AS total
        FROM daily_labours
        WHERE status = 'PAID'
          AND substr(labour_date, 1, 4) = ?
      `).bind(year).first()
    : await env.DB.prepare(`
        SELECT IFNULL(SUM(amount), 0) AS total
        FROM daily_labours
        WHERE status = 'PAID'
          AND substr(labour_date, 1, 7) = ?
      `).bind(month).first();

  const totalSalary = Number(salaryRow.total || 0) + Number(dailyRow.total || 0);

  return new Response(JSON.stringify({
    period,
    month,
    year,
    salary_monthly: salaryRow.total,
    salary_daily: dailyRow.total,
    total: totalSalary
  }), { headers: { "Content-Type": "application/json" } });
}
lary
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
