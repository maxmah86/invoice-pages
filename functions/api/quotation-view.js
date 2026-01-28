export async function onRequest({ request, env }) {

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

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return new Response("Missing id", { status: 400 });
  }

  const quotation = await env.DB.prepare(`
    SELECT
      id,
      quotation_no,
      customer,
      amount,
      status,
      created_at,
      terms_snapshot
    FROM quotations
    WHERE id = ?
  `).bind(id).first();

  if (!quotation) {
    return new Response("Quotation not found", { status: 404 });
  }

  const items = await env.DB.prepare(`
    SELECT
      id,
      description,
      qty,
      price
    FROM quotation_items
    WHERE quotation_id = ?
    ORDER BY id ASC
  `).bind(id).all();

  return Response.json({
    quotation,
    items: items.results
  });
}
