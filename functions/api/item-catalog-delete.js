export async function onRequestPost({ request, env }) {

  /* ===== AUTH ===== */
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = await env.DB.prepare(`
    SELECT role
    FROM users
    WHERE session_token = ?
  `).bind(
    cookie.match(/session=([^;]+)/)?.[1]
  ).first();

  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  /* ===== BODY ===== */
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { id } = body;
  if (!id) {
    return new Response("Missing id", { status: 400 });
  }

  /* ===== DELETE ===== */
  await env.DB.prepare(`
    DELETE FROM item_catalogs
    WHERE id = ?
  `).bind(id).run();

  return Response.json({ success: true });
}
