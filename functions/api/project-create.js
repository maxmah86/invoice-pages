/**
 * API: /api/project-create (POST)
 * 权限规则: 允许 admin 和 moderator 角色创建项目
 */

export async function onRequestPost({ request, env }) {

  /* ===============================
     1. AUTH CHECK (允许 admin 和 moderator)
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const user = await env.DB.prepare(`
    SELECT id, username, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // 统一转小写去除空格，增强校验稳健度
  const userRole = (user.role || "").toString().trim().toLowerCase();
  if (userRole !== "admin" && userRole !== "moderator") {
    return jsonResponse({ error: "Forbidden: Admin or Moderator access required" }, 403);
  }

  /* ===============================
     2. PARSE BODY
     =============================== */
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON format" }, 400);
  }

  const {
    project_name,
    client_name,
    project_type = "contract",
    contract_value = 0,
    start_date,
    notes
  } = body;

  if (!project_name || !client_name) {
    return jsonResponse({ error: "project_name and client_name are required" }, 400);
  }

  /* ===============================
     3. GENERATE PROJECT NO (日期+4位自增流水)
     =============================== */
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `PROJ-${today}-`;

  const maxRow = await env.DB.prepare(`
    SELECT MAX(project_no) AS max_no
    FROM projects
    WHERE project_no LIKE ?
  `).bind(prefix + "%").first();

  let seq = 1;
  if (maxRow?.max_no) {
    const lastSeq = parseInt(maxRow.max_no.slice(-4), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  const project_no = `${prefix}${String(seq).padStart(4, "0")}`;

  /* ===============================
     4. INSERT (记录 created_by 用户 ID)
     =============================== */
  try {
    const result = await env.DB.prepare(`
      INSERT INTO projects (
        project_no,
        project_name,
        client_name,
        project_type,
        contract_value,
        start_date,
        status,
        notes,
        created_by,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, datetime('now'))
    `).bind(
      project_no,
      project_name.trim(),
      client_name.trim(),
      project_type,
      Number(contract_value) || 0,
      start_date || null,
      (notes || "").trim(),
      user.id // 记录创建者的 User ID
    ).run();

    return jsonResponse({
      success: true,
      id: result.meta.last_row_id,
      project_no
    }, 200);

  } catch (err) {
    return jsonResponse({ error: "Database error: " + err.message }, 500);
  }
}

/* 统一 JSON 响应辅助函数 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
