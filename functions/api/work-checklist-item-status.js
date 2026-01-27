export async function onRequestPost({ request, env }) {

  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id, status } = await request.json();
  if (!id || !status) {
    return new Response("Invalid data", { status: 400 });
  }

  const allowed = ["NOT_STARTED", "IN_PROGRESS", "DONE"];
  if (!allowed.includes(status)) {
    return new Response("Invalid status", { status: 400 });
  }

  const r = await env.DB.prepare(`
    UPDATE work_checklist_items
    SET status = ?
    WHERE id = ?
  `).bind(
    status,
    id
  ).run();

  if (r.meta.changes === 0) {
    return new Response("Not found", { status: 404 });
  }

  return Response.json({ success: true });
}