export async function onRequestPost({ request, env }) {

  const auth = await fetch(new URL("/api/auth-check", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" }
  });
  if (!auth.ok) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id, is_active } = await request.json();
  if (!id) {
    return new Response("Missing id", { status: 400 });
  }

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
