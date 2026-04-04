function getQuarterRange(year, quarter) {
  const q = Number(quarter);
  const startMonth = String((q - 1) * 3 + 1).padStart(2, "0");
  const endMonth = String((q - 1) * 3 + 3).padStart(2, "0");
  return { start: `${year}-${startMonth}`, end: `${year}-${endMonth}` };
}

export async function onRequestGet({ request, env }) {
  const auth = await fetch(new URL("/api/auth-check", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" }
  });
  if (!auth.ok) return new Response("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const periodRaw = url.searchParams.get("period");
  const period = ["month", "quarter", "year"].includes(periodRaw) ? periodRaw : "month";
  const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const year = url.searchParams.get("year") || new Date().getFullYear().toString();
  const quarter = url.searchParams.get("quarter") || String(Math.floor((new Date().getMonth()) / 3) + 1);

  let salaryRow;
  let dailyRow;

  if (period === "year") {
    salaryRow = await env.DB.prepare(`
      SELECT IFNULL(SUM(net_salary), 0) AS total
      FROM salaries
      WHERE substr(salary_month, 1, 4) = ?
        AND status = 'PAID'
    `).bind(year).first();

    dailyRow = await env.DB.prepare(`
      SELECT IFNULL(SUM(amount), 0) AS total
      FROM daily_labours
      WHERE status = 'PAID'
        AND substr(labour_date, 1, 4) = ?
    `).bind(year).first();
  } else if (period === "quarter") {
    const { start, end } = getQuarterRange(year, quarter);
    salaryRow = await env.DB.prepare(`
      SELECT IFNULL(SUM(net_salary), 0) AS total
      FROM salaries
      WHERE salary_month BETWEEN ? AND ?
        AND status = 'PAID'
    `).bind(start, end).first();

    dailyRow = await env.DB.prepare(`
      SELECT IFNULL(SUM(amount), 0) AS total
      FROM daily_labours
      WHERE status = 'PAID'
        AND substr(labour_date, 1, 7) BETWEEN ? AND ?
    `).bind(start, end).first();
  } else {
    salaryRow = await env.DB.prepare(`
      SELECT IFNULL(SUM(net_salary), 0) AS total
      FROM salaries
      WHERE salary_month = ?
        AND status = 'PAID'
    `).bind(month).first();

    dailyRow = await env.DB.prepare(`
      SELECT IFNULL(SUM(amount), 0) AS total
      FROM daily_labours
      WHERE status = 'PAID'
        AND substr(labour_date, 1, 7) = ?
    `).bind(month).first();
  }

  const totalSalary = Number(salaryRow.total || 0) + Number(dailyRow.total || 0);

  return new Response(JSON.stringify({
    period,
    month,
    year,
    quarter,
    salary_monthly: salaryRow.total,
    salary_daily: dailyRow.total,
    total: totalSalary
  }), { headers: { "Content-Type": "application/json" } });
}
