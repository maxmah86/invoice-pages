export async function onRequestPost({ request, env }) {

  /* ===============================
     1. AUTH CHECK
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const user = await env.DB.prepare(`
    SELECT id, username, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user || user.role !== "admin") {
    return new Response(
      JSON.stringify({ error: user ? "Forbidden" : "Unauthorized" }),
      { status: user ? 403 : 401, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     2. PARSE BODY
     =============================== */
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
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
    return new Response(
      JSON.stringify({ error: "project_name and client_name are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     3. GENERATE PROJECT NO
     e.g. PROJ-20250520-0001
     =============================== */
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `PROJ-${today}-`;

  // Use MAX to find the highest existing seq for today — safe against retries
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
      start_date || null,
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
