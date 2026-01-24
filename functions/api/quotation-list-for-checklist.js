export async function onRequestGet({ request, env }) {

  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rows = await env.DB.prepare(`
    SELECT
      id,
      quotation_no,
      customer
    FROM quotations
    WHERE status = 'ACCEPTED'
    ORDER BY created_at DESC
  `).all();

  return Response.json(rows.results || []);
}
