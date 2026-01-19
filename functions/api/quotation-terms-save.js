export async function onRequestPost({ request, env }) {

  /* ===== AUTH ===== */
  const auth = await fetch(new URL("/api/auth-check", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" }
  });
  if (!auth.ok) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!env.DB) {
    return new Response("DB not bound", { status: 500 });
  }

  const { id, title, content, is_active } = await request.json();

  if (!title || !content) {
    return new Response("Invalid data", { status: 400 });
  }

  /* ===== UPDATE ===== */
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

    return Response.json({ success: true, mode: "update" });
  }

  /* ===== CREATE ===== */
  await env.DB.prepare(`
    INSERT INTO quotation_terms (title, content, is_active)
    VALUES (?, ?, ?)
  `).bind(
    title,
    content,
    is_active ? 1 : 0
  ).run();

  return Response.json({ success: true, mode: "create" });
}
