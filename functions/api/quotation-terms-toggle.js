export async function onRequestPost({ request, env }) {

  /* ===============================
     AUTH CHECK (ADMIN ONLY)
     =============================== */
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

  /* ===============================
     PARSE BODY
     =============================== */
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { id, is_active } = body;

  if (!id) {
    return new Response("Missing id", { status: 400 });
  }

  /* ===============================
     UPDATE TERM STATUS
     =============================== */
  await env.DB.prepare(`
    UPDATE quotation_terms
    SET is_active = ?
    WHERE id = ?
  `).bind(
    is_active ? 1 : 0,
    id
  ).run();

  return Response.json({ success: true });
}
