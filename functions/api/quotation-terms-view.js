export async function onRequestGet({ request, env }) {

  const auth = await fetch(new URL("/api/auth-check", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" }
  });
  if (!auth.ok) {
    return new Response("Unauthorized", { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return new Response("Missing id", { status: 400 });
  }

  const term = await env.DB.prepare(`
    SELECT id, title, content, is_active
    FROM quotation_terms
    WHERE id = ?
  `).bind(id).first();

  if (!term) {
    return new Response("Not found", { status: 404 });
  }

  return Response.json(term);
}
