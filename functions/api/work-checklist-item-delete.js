export async function onRequestPost({ request, env }) {

  /* ===== Auth ===== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = await env.DB.prepare(`
    SELECT id, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  /* ===== Input ===== */
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { id } = body || {};
  if (!id) {
    return new Response("Missing item id", { status: 400 });
  }

  /* ===== Delete ===== */
  const r = await env.DB.prepare(`
    DELETE FROM work_checklist_items
    WHERE id = ?
  `).bind(id).run();

  if (r.meta.changes === 0) {
    return new Response("Item not found", { status: 404 });
  }

  return Response.json({
    success: true,
    deleted_id: id
  });
}
