export async function onRequestGet({ request, env }) {
  // --- 1. Auth (复用你现有的权限校验) ---
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const user = await env.DB.prepare(`
    SELECT id, role FROM users WHERE session_token = ?
  `).bind(token).first();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  // --- 2. 获取 project_id 参数 ---
  const url = new URL(request.url);
  const projectId = url.searchParams.get("project_id");
  if (!projectId) {
    return new Response(JSON.stringify({ error: "project_id required" }), { status: 400 });
  }

  // --- 3. 查询该项目的所有报价单项（同时带上报价单信息便于分组显示）---
  const { results } = await env.DB.prepare(`
    SELECT
      q.id AS quotation_id,
      q.quotation_no,
      q.customer,
      qi.id AS item_id,
      qi.description,
      qi.UOM,
      qi.unit_price AS price
    FROM quotations q
    JOIN quotation_items qi ON q.id = qi.quotation_id
    WHERE q.project_id = ?
    ORDER BY q.created_at DESC, qi.sort_order
  `).bind(projectId).all();

  return new Response(JSON.stringify(results || []), {
    headers: { "Content-Type": "application/json" }
  });
}