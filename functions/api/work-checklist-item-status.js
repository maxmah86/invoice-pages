export async function onRequestPost({ request, env }) {

  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id, status } = await request.json();

  if (!id || !["NOT_STARTED", "IN_PROGRESS", "DONE"].includes(status)) {
    return new Response("Invalid data", { status: 400 });
  }

  await env.DB.prepare(`
    UPDATE work_checklist_items
    SET status = ?
    WHERE id = ?
  `).bind(status, id).run();

  return Response.json({ success: true });
}
