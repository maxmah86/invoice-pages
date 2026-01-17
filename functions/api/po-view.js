export async function onRequestGet({ request, env }) {

  /* ===============================
     AUTH CHECK
     =============================== */
  const authRes = await fetch(new URL("/api/auth-check", request.url), {
    headers: {
      cookie: request.headers.get("cookie") || ""
    }
  });

  if (!authRes.ok) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  /* ===============================
     GET ID
     =============================== */
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new Response(
      JSON.stringify({ error: "Missing id" }),
      { status: 400 }
    );
  }

  /* ===============================
     QUERY PO HEADER
     =============================== */
  const po = await env.DB.prepare(`
    SELECT
      id,
      po_no,
      po_date,
      status,
      supplier_name,
      supplier_address,
      subtotal,
      total
    FROM purchase_orders
    WHERE id = ?
  `).bind(id).first();

  if (!po) {
    return new Response(
      JSON.stringify({ error: "PO not found" }),
      { status: 404 }
    );
  }

  /* ===============================
     QUERY PO ITEMS
     =============================== */
  const itemsResult = await env.DB.prepare(`
    SELECT
      description,
      qty,
      unit_price,
      line_total
    FROM purchase_order_items
    WHERE purchase_order_id = ?
    ORDER BY id ASC
  `).bind(id).all();

  /* ===============================
     RESPONSE
     =============================== */
  return new Response(
    JSON.stringify({
      po_no: po.po_no,
      po_date: po.po_date,
      status: po.status,
      supplier_name: po.supplier_name,
      supplier_address: po.supplier_address,
      subtotal: po.subtotal,
      total: po.total,
      items: itemsResult.results
    }),
    { status: 200 }
  );
}
