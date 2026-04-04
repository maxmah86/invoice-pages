export async function onRequestGet({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];
  if (!token) return new Response("Unauthorized", { status: 401 });

  const user = await env.DB.prepare(`SELECT role FROM users WHERE session_token = ?`).bind(token).first();
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const period = url.searchParams.get("period") === "year" ? "year" : "month";
  const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const year = url.searchParams.get("year") || new Date().getFullYear().toString();

  const row = period === "year"
    ? await env.DB.prepare(`
        SELECT IFNULL(SUM(grand_total), 0) AS total
        FROM quotations
        WHERE status = 'ACCEPTED'
          AND substr(created_at, 1, 4) = ?
      `).bind(year).first()
    : await env.DB.prepare(`
        SELECT IFNULL(SUM(grand_total), 0) AS total
        FROM quotations
        WHERE status = 'ACCEPTED'
          AND substr(created_at, 1, 7) = ?
      `).bind(month).first();

  return Response.json({
    period,
    month,
    year,
    total: Number(row.total || 0)
  });
}
