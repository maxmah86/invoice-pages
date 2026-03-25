export async function onRequestPost({ request, env }) {
  /* ── 1. 权限检查 ── */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const user = await env.DB.prepare(`
    SELECT role FROM users WHERE session_token = ?
  `).bind(token).first();

  if (!user || user.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  /* ── 2. 解析参数 ── */
  const { project_id, status } = await request.json();

  if (!project_id || !status) {
    return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
  }

  /* ── 3. 更新数据库 ── */
  try {
    await env.DB.prepare(`
      UPDATE projects 
      SET status = ? 
      WHERE id = ?
    `).bind(status, project_id).run();

    return new Response(JSON.stringify({ success: true }));
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
