export async function onRequestGet({ request, env }) {

  const auth = await fetch(new URL("/api/auth-check", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" }
  });
  if (!auth.ok) return new Response("Unauthorized", { status: 401 });

  const row = await env.DB.prepare(`
    SELECT IFNULL(SUM(total), 0) AS total
    FROM purchase_orders
  `).first();

  return new Response(
    JSON.stringify({ total: row.total }),
    { headers: { "Content-Type": "application/json" } }
  );
}
