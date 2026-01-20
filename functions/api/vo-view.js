export async function onRequestGet({ request, env }) {

  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return new Response("Missing id", { status: 400 });
  }

  const vo = await env.DB.prepare(`
    SELECT
      id,
      vo_no,
      quotation_id,
      invoice_id,
      title,
      reason,
      status,
      amount,
      created_at,
      approved_at,
      approved_by,
      notes
    FROM variation_orders
    WHERE id = ?
  `).bind(id).first();

  if (!vo) {
    return new Response("VO not found", { status: 404 });
  }

  const items = await env.DB.prepare(`
    SELECT
      description,
      qty,
      unit_price,
      line_total
    FROM variation_order_items
    WHERE variation_order_id = ?
    ORDER BY id ASC
  `).bind(id).all();

  return Response.json({
    vo,
    items: items.results
  });
}
