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

  if (!env.DB) {
    return new Response("DB not bound", { status: 500 });
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

  const { id, title, content, is_active } = body;

  if (!title || !content) {
    return new Response("Invalid data", { status: 400 });
  }

  /* ===============================
     UPDATE
     =============================== */
  if (id) {
    await env.DB.prepare(`
      UPDATE quotation_terms
      SET
        title = ?,
        content = ?,
        is_active = ?
      WHERE id = ?
    `).bind(
      title,
      content,
      is_active ? 1 : 0,
      id
    ).run();

    return Response.json({
      success: true,
      mode: "update",
      updated_by: user.id
    });
  }

  /* ===============================
     CREATE
     =============================== */
  await env.DB.prepare(`
    INSERT INTO quotation_terms (title, content, is_active)
    VALUES (?, ?, ?)
  `).bind(
    title,
    content,
    is_active ? 1 : 0
  ).run();

  return Response.json({
    success: true,
    mode: "create",
    created_by: user.id
  });
}
