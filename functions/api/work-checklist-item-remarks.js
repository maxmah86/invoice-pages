export async function onRequestPost({ request, env }) {

  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id, remarks } = await request.json();

  if (!id) {
    return new Response("Invalid data", { status: 400 });
  }

  await env.DB.prepare(`
    UPDATE work_checklist_items
    SET remarks = ?
    WHERE id = ?
  `).bind(
    remarks || "",
    id
  ).run();

  return Response.json({ success: true });
}
