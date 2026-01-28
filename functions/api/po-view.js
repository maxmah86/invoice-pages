export async function onRequestGet({ request, env }) {

  /* ===============================
     AUTH CHECK (session_token)
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const user = await env.DB.prepare(`
    SELECT id, username, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     GET PO ID
     =============================== */
  const id = new URL(request.url).searchParams.get("id");

  if (!id) {
    return new Response(
      JSON.stringify({ error: "Missing id" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     QUERY PO HEADER
     =============================== */
  const po = await env.DB.prepare(`
    SELECT
      po_no,
      po_date,
      supplier_name,
      issued_by,
      status,
      notes,
      delivery_address,
      delivery_date,
      delivery_time,
      subtotal,
      total
    FROM purchase_orders
    WHERE id = ?
  `).bind(id).first();

  if (!po) {
    return new Response(
      JSON.stringify({ error: "PO not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     QUERY PO ITEMS
     (unit_price → price)
     =============================== */
  const itemsResult = await env.DB.prepare(`
    SELECT
      description,
      qty,
      unit_price AS price
    FROM purchase_order_items
    WHERE purchase_order_id = ?
    ORDER BY id ASC
  `).bind(id).all();

  /* ===============================
     RESPONSE
     =============================== */
  return new Response(
    JSON.stringify({
      viewer: {
        username: user.username,
        role: user.role
      },
      po: {
        po_no: po.po_no,
        po_date: po.po_date,
        supplier_name: po.supplier_name,
        issued_by: po.issued_by,
        status: po.status,
        notes: po.notes,
        delivery_address: po.delivery_address,
        delivery_date: po.delivery_date,
        delivery_time: po.delivery_time,
        subtotal: po.subtotal,
        total: po.total
      },
      items: itemsResult.results
    }),
    {
      headers: { "Content-Type": "application/json" }
    }
  );
}
