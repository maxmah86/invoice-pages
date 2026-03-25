export async function onRequestPost({ request, env }) {

  /* ===============================
     1. AUTH CHECK (保持不变)
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const user = await env.DB.prepare(`
    SELECT id, username, role FROM users WHERE session_token = ?
  `).bind(token).first();

  if (!user || user.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  /* ===============================
     2. PARSE & VALIDATE BODY
     =============================== */
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const {
    project_name,
    client_name,
    project_type = "contract",
    contract_value = 0,
    start_date, // 必须获取此字段
    notes
  } = body;

  // 后端强制校验：增加了 start_date 检查
  if (!project_name || !client_name || !start_date) {
    return new Response(
      JSON.stringify({ error: "project_name, client_name, and start_date are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     3. GENERATE PROJECT NO (保持不变)
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
     4. INSERT
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
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, datetime('now'))
    `).bind(
      project_no,
      project_name,
      client_name,
      project_type,
      Number(contract_value) || 0,
      start_date, // 这里现在确定是有值的字符串
      notes || ""
    ).run();

    return new Response(
      JSON.stringify({
        success: true,
        id: result.meta.last_row_id,
        project_no
      }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Database error: " + err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
