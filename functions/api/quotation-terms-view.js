export async function onRequestGet({ request, env }) {

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
     GET ID
     =============================== */
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return new Response("Missing id", { status: 400 });
  }

  /* ===============================
     LOAD TERM
     =============================== */
  const term = await env.DB.prepare(`
    SELECT
      id,
      title,
      content,
      is_active
    FROM quotation_terms
    WHERE id = ?
  `).bind(id).first();

  if (!term) {
    return new Response("Not found", { status: 404 });
  }

  /* ===============================
     RESPONSE
     =============================== */
  return Response.json(term);
}
