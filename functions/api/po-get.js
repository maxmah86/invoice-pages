export async function onRequestGet({ request, env }) {

  /* ===== AUTH CHECK ===== */
  const authRes = await fetch(new URL("/api/auth-check", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" }
  });

  if (!authRes.ok) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  /* ===== GET ID ===== */
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 });
  }

  /* ===== PO HEADER ===== */
  const po = await env.DB.prepare(`
    SELECT
      id,
      po_no,
      po_date,
      status,
      supplier_name,
      supplier_address,
      issued_by,
      delivery_address,
      delivery_date,
      delivery_time,
      notes,
      signed_by,
      subtotal,
      total
    FROM purchase_orders
    WHERE id = ?
  `).bind(id).first();

  if (!po) {
    return new Response(JSON.stringify({ error: "PO not found" }), { status: 404 });
  }

  /* ===== PO ITEMS ===== */
  const itemsResult = await env.DB.prepare(`
    SELECT
      description,
      qty,
      unit_price
    FROM purchase_order_items
    WHERE purchase_order_id = ?
    ORDER BY id ASC
  `).bind(id).all();

  /* ===== RESPONSE ===== */
  return new Response(
    JSON.stringify({
      ...po,
      items: itemsResult.results
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
