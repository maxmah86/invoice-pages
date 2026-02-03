export async function onRequestGet({ request, env }) {

  /* ===============================
     AUTH CHECK
     =============================== */
  const auth = await fetch(new URL("/api/auth-check", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" }
  });
  if (!auth.ok) {
    return new Response("Unauthorized", { status: 401 });
  }

  /* ===============================
     GET MONTH
     =============================== */
  const url = new URL(request.url);
  const month =
    url.searchParams.get("month") ||
    new Date().toISOString().slice(0, 7); // YYYY-MM

  /* ===============================
     1. MONTHLY SALARY (PAID)
     =============================== */
  const salaryRow = await env.DB.prepare(`
    SELECT IFNULL(SUM(net_salary), 0) AS total
    FROM salaries
    WHERE salary_month = ?
      AND status = 'PAID'
  `).bind(month).first();

  /* ===============================
     2. DAILY LABOUR (PAID)
     =============================== */
  const dailyRow = await env.DB.prepare(`
    SELECT IFNULL(SUM(amount), 0) AS total
    FROM daily_labours
    WHERE status = 'PAID'
      AND substr(labour_date, 1, 7) = ?
  `).bind(month).first();

  /* ===============================
     TOTAL SALARY COST
     =============================== */
  const totalSalary =
    Number(salaryRow.total || 0) +
    Number(dailyRow.total || 0);

  /* ===============================
     RESPONSE
     =============================== */
  return new Response(
    JSON.stringify({
      month,
      salary_monthly: salaryRow.total,
      salary_daily: dailyRow.total,
      total: totalSalary
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
