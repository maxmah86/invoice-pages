export async function onRequestGet({ request, env }) {
  const auth = await fetch(new URL("/api/auth-check", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" }
  });
  if (!auth.ok) return new Response("Unauthorized", { status: 401 });

  const month = new Date().toISOString().slice(0,7);

  const r = await env.DB.prepare(`
    SELECT IFNULL(SUM(total),0) AS total
    FROM invoices
    WHERE substr(invoice_date,1,7)=?
  `).bind(month).first();

  return new Response(JSON.stringify({ total: r.total }), {
    headers:{ "Content-Type":"application/json" }
  });
}
