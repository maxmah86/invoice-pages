export async function onRequestGet({ request, env }) {

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

  // 🔒 dashboard 建议 admin only
  if (user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const month =
    url.searchParams.get("month") ||
    new Date().toISOString().slice(0, 7);

  const columns = await env.DB.prepare(`
    PRAGMA table_info(invoices)
  `).all();

  const names = columns.results.map(c => c.name);

  let amountColumn = null;
  if (names.includes("total")) amountColumn = "total";
  else if (names.includes("grand_total")) amountColumn = "grand_total";
  else if (names.includes("amount")) amountColumn = "amount";
  else if (names.includes("sub_total")) amountColumn = "sub_total";

  if (!amountColumn) {
    return Response.json({
      month,
      total: 0,
      error: "no amount column found"
    });
  }

  const row = await env.DB.prepare(`
    SELECT IFNULL(SUM(${amountColumn}), 0) AS total
    FROM invoices
    WHERE substr(created_at, 1, 7) = ?
  `).bind(month).first();

  return Response.json({
    month,
    total: Number(row.total || 0),
    column_used: amountColumn
  });
}
