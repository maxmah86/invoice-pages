function getQuarterRange(year, quarter) {
  const q = Number(quarter);
  const startMonth = String((q - 1) * 3 + 1).padStart(2, "0");
  const endMonth = String((q - 1) * 3 + 3).padStart(2, "0");
  return { start: `${year}-${startMonth}`, end: `${year}-${endMonth}` };
}

export async function onRequestGet({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) return new Response("Unauthorized", { status: 401 });

  const user = await env.DB.prepare(`
    SELECT id, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "admin") return new Response("Forbidden", { status: 403 });

  try {
    const url = new URL(request.url);
    const periodRaw = url.searchParams.get("period");
    const period = ["month", "quarter", "year"].includes(periodRaw) ? periodRaw : "month";
    const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
    const year = url.searchParams.get("year") || new Date().getFullYear().toString();
    const quarter = url.searchParams.get("quarter") || String(Math.floor((new Date().getMonth()) / 3) + 1);
    const { start, end } = getQuarterRange(year, quarter);

    let salaryRow;
    let dailyRow;
    let poRow;
    let piRow;

    if (period === "year") {
      salaryRow = await env.DB.prepare(`SELECT IFNULL(SUM(net_salary),0) AS total FROM salaries WHERE substr(salary_month,1,4) = ? AND status = 'PAID'`).bind(year).first();
      dailyRow = await env.DB.prepare(`SELECT IFNULL(SUM(amount),0) AS total FROM daily_labours WHERE status = 'PAID' AND substr(labour_date,1,4) = ?`).bind(year).first();
      poRow = await env.DB.prepare(`SELECT IFNULL(SUM(total),0) AS total FROM purchase_orders WHERE substr(created_at,1,4) = ?`).bind(year).first();
      piRow = await env.DB.prepare(`SELECT IFNULL(SUM(net_amount),0) AS total FROM purchase_invoices WHERE status IN ('APPROVED', 'PARTIAL', 'PAID') AND substr(created_at,1,4) = ?`).bind(year).first();
    } else if (period === "quarter") {
      salaryRow = await env.DB.prepare(`SELECT IFNULL(SUM(net_salary),0) AS total FROM salaries WHERE salary_month BETWEEN ? AND ? AND status = 'PAID'`).bind(start, end).first();
      dailyRow = await env.DB.prepare(`SELECT IFNULL(SUM(amount),0) AS total FROM daily_labours WHERE status = 'PAID' AND substr(labour_date,1,7) BETWEEN ? AND ?`).bind(start, end).first();
      poRow = await env.DB.prepare(`SELECT IFNULL(SUM(total),0) AS total FROM purchase_orders WHERE substr(created_at,1,7) BETWEEN ? AND ?`).bind(start, end).first();
      piRow = await env.DB.prepare(`SELECT IFNULL(SUM(net_amount),0) AS total FROM purchase_invoices WHERE status IN ('APPROVED', 'PARTIAL', 'PAID') AND substr(created_at,1,7) BETWEEN ? AND ?`).bind(start, end).first();
    } else {
      salaryRow = await env.DB.prepare(`SELECT IFNULL(SUM(net_salary),0) AS total FROM salaries WHERE salary_month = ? AND status = 'PAID'`).bind(month).first();
      dailyRow = await env.DB.prepare(`SELECT IFNULL(SUM(amount),0) AS total FROM daily_labours WHERE status = 'PAID' AND substr(labour_date,1,7) = ?`).bind(month).first();
      poRow = await env.DB.prepare(`SELECT IFNULL(SUM(total),0) AS total FROM purchase_orders WHERE substr(created_at,1,7) = ?`).bind(month).first();
      piRow = await env.DB.prepare(`SELECT IFNULL(SUM(net_amount),0) AS total FROM purchase_invoices WHERE status IN ('APPROVED', 'PARTIAL', 'PAID') AND substr(created_at,1,7) = ?`).bind(month).first();
    }

    const salaryTotal = Number(salaryRow.total || 0) + Number(dailyRow.total || 0);
    const poTotal = Number(poRow.total || 0);
    const piTotal = Number(piRow.total || 0);

    const columns = await env.DB.prepare(`PRAGMA table_info(invoices)`).all();
    const names = columns.results.map(c => c.name);

    let amountColumn = null;
    if (names.includes("total")) amountColumn = "total";
    else if (names.includes("grand_total")) amountColumn = "grand_total";
    else if (names.includes("amount")) amountColumn = "amount";
    else if (names.includes("sub_total")) amountColumn = "sub_total";

    let invoiceTotal = 0;
    if (amountColumn) {
      const invRow = period === "year"
        ? await env.DB.prepare(`SELECT IFNULL(SUM(${amountColumn}),0) AS total FROM invoices WHERE substr(created_at,1,4) = ?`).bind(year).first()
        : period === "quarter"
          ? await env.DB.prepare(`SELECT IFNULL(SUM(${amountColumn}),0) AS total FROM invoices WHERE substr(created_at,1,7) BETWEEN ? AND ?`).bind(start, end).first()
          : await env.DB.prepare(`SELECT IFNULL(SUM(${amountColumn}),0) AS total FROM invoices WHERE substr(created_at,1,7) = ?`).bind(month).first();
      invoiceTotal = Number(invRow.total || 0);
    }

    const profit = invoiceTotal - salaryTotal - poTotal - piTotal;

    return Response.json({
      period,
      month,
      year,
      quarter,
      invoice: invoiceTotal,
      salary: salaryTotal,
      po: poTotal,
      pi: piTotal,
      profit
    });
  } catch (err) {
    return Response.json({ error: "profit calculation error", detail: String(err) }, { status: 500 });
  }
}
