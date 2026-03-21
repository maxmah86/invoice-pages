export async function onRequestGet({ request, env }) {

  /* ── Auth ── */
  const cookie = request.headers.get("Cookie") || "";
  const token  = cookie.match(/session=([^;]+)/)?.[1];
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const user = await env.DB.prepare(
    `SELECT id, role FROM users WHERE session_token = ?`
  ).bind(token).first();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id)  return Response.json({ error: "Missing id" }, { status: 400 });

  try {
    const expense = await env.DB.prepare(`
      SELECT e.*, p.project_name, p.project_no
      FROM expenses e
      LEFT JOIN projects p ON p.id = e.project_id
      WHERE e.id = ?
    `).bind(id).first();

    if (!expense) return Response.json({ error: "Not found" }, { status: 404 });

    return Response.json({ success: true, expense });
  } catch (err) {
    return Response.json({ error: "DB error: " + err.message }, { status: 500 });
  }
}
