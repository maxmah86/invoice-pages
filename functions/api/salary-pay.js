export async function onRequestPost({ request, env }) {
  const auth = await fetch(new URL("/api/auth-check", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" }
  });
  if (!auth.ok) return new Response("Unauthorized", { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { id } = body;
  if (!id) return new Response("Missing id", { status: 400 });

  await env.DB.prepare(`
    UPDATE salaries
    SET status = 'PAID'
    WHERE id = ? AND status = 'DRAFT'
  `).bind(id).run();

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { "Content-Type": "application/json" } }
  );
}
