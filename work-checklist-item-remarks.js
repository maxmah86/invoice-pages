export async function onRequestPost({ request, env }) {

  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = await env.DB.prepare(`
    SELECT id, username, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { id, remarks } = body || {};
  if (!id) {
    return new Response("Invalid data", { status: 400 });
  }

  const r = await env.DB.prepare(`
    UPDATE work_checklist_items
    SET remarks = ?
    WHERE id = ?
  `).bind(
    remarks || "",
    id
  ).run();

  if (r.meta.changes === 0) {
    return new Response("Item not found", { status: 404 });
  }

  return Response.json({
    success: true,
    updated_by: user.username,
    role: user.role
  });
}
