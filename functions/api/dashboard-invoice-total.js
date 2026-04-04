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

  const url = new URL(request.url);
  const periodRaw = url.searchParams.get("period");
  const period = ["month", "quarter", "year"].includes(periodRaw) ? periodRaw : "month";
  const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const year = url.searchParams.get("year") || new Date().getFullYear().toString();
  const quarter = url.searchParams.get("quarter") || String(Math.floor((new Date().getMonth()) / 3) + 1);

  const columns = await env.DB.prepare(`PRAGMA table_info(invoices)`).all();
  const names = columns.results.map(c => c.name);

  let amountColumn = null;
  if (names.includes("total")) amountColumn = "total";
  else if (names.includes("grand_total")) amountColumn = "grand_total";
  else if (names.includes("amount")) amountColumn = "amount";
  else if (names.includes("sub_total")) amountColumn = "sub_total";

  if (!amountColumn) {
    return Response.json({ period, month, year, quarter, total: 0, error: "no amount column found" });
  }

  let row;
  if (period === "year") {
    row = await env.DB.prepare(`
      SELECT IFNULL(SUM(${amountColumn}), 0) AS total
      FROM invoices
      WHERE substr(created_at, 1, 4) = ?
    `).bind(year).first();
  } else if (period === "quarter") {
    const { start, end } = getQuarterRange(year, quarter);
    row = await env.DB.prepare(`
      SELECT IFNULL(SUM(${amountColumn}), 0) AS total
      FROM invoices
      WHERE substr(created_at, 1, 7) BETWEEN ? AND ?
    `).bind(start, end).first();
  } else {
    row = await env.DB.prepare(`
      SELECT IFNULL(SUM(${amountColumn}), 0) AS total
      FROM invoices
      WHERE substr(created_at, 1, 7) = ?
    `).bind(month).first();
  }

  return Response.json({
    period,
    month,
    year,
    quarter,
    total: Number(row.total || 0),
    column_used: amountColumn
  });
}
