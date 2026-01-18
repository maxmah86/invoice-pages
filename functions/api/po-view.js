// /functions/api/po-view.js
export async function onRequestGet({ request, env }) {
  const auth = await fetch(new URL("/api/auth-check", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" }
  });
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 });
  }

  const po = await env.DB.prepare(`
    SELECT
      po_no,
      po_date,
      supplier_name,
      status,
      notes,
      delivery_address,
      delivery_date,
      delivery_time
    FROM purchase_orders
    WHERE id = ?
  `).bind(id).first();

  if (!po) {
    return new Response(JSON.stringify({ error: "PO not found" }), { status: 404 });
  }

  const items = await env.DB.prepare(`
    SELECT
      description,
      qty,
      unit_price AS price   -- 🔥 关键：映射成 price
    FROM purchase_order_items
    WHERE purchase_order_id = ?
    ORDER BY id ASC
  `).bind(id).all();

  return new Response(JSON.stringify({
    po: {
      po_no: po.po_no,
      po_date: po.po_date,
      supplier: po.supplier_name,
      status: po.status,
      notes: po.notes,
      delivery_address: po.delivery_address,
      delivery_date: po.delivery_date,
      delivery_time: po.delivery_time
    },
    items: items.results
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
