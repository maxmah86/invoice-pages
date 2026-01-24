export async function onRequestPost({ request, env }) {

  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { item_id, status } = await request.json();

  if (!item_id || !status) {
    return new Response("Invalid data", { status: 400 });
  }

  if (!["NOT_STARTED", "IN_PROGRESS", "DONE"].includes(status)) {
    return new Response("Invalid status", { status: 400 });
  }

  const r = await env.DB.prepare(`
    UPDATE work_checklist_items
    SET status = ?
    WHERE id = ?
  `).bind(status, item_id).run();

  if (r.meta.changes === 0) {
    return new Response("Item not found", { status: 404 });
  }

  return Response.json({
    success: true,
    item_id,
    status
  });
}
