export async function onRequestPost({ request, env }) {

  /* ===== AUTH ===== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await env.DB.prepare(`
    SELECT id, role FROM users WHERE session_token = ?
  `).bind(token).first();

  if (!user || user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  /* ===== BODY ===== */
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { project_id, contract_value } = body;

  if (!project_id || contract_value == null) {
    return Response.json({ error: "project_id and contract_value required" }, { status: 400 });
  }

  /* ===== UPDATE ===== */
  await env.DB.prepare(`
    UPDATE projects SET contract_value = ? WHERE id = ?
  `).bind(Number(contract_value), project_id).run();

  return Response.json({ success: true, contract_value: Number(contract_value) });
}
