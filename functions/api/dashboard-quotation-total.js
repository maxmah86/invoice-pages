export async function onRequestGet({ request, env }) {
  // 1. 身份验证 (参考您现有的逻辑)
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];
  if (!token) return new Response("Unauthorized", { status: 401 });

  const user = await env.DB.prepare(`SELECT role FROM users WHERE session_token = ?`).bind(token).first();
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });

  // 2. 获取月份参数
  const url = new URL(request.url);
  const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);

  // 3. 查询状态为 ACCEPTED 的 grand_total 总和
  const row = await env.DB.prepare(`
    SELECT IFNULL(SUM(grand_total), 0) AS total
    FROM quotations
    WHERE status = 'ACCEPTED' 
      AND substr(created_at, 1, 7) = ?
  `).bind(month).first();

  return Response.json({
    month,
    total: Number(row.total || 0)
  });
}
