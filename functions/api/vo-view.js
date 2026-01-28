export async function onRequestGet({ request, env }) {

  /* ===============================
     AUTH CHECK (session_token)
     =============================== */
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

  /* ===== ROLE CHECK ===== */
  if (!["admin", "staff"].includes(user.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  /* ===============================
     GET ID
     =============================== */
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return new Response("Missing id", { status: 400 });
  }

  /* ===============================
     LOAD VO
     =============================== */
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

  /* ===============================
     LOAD VO ITEMS
     =============================== */
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

  /* ===============================
     RESPONSE
     =============================== */
  return Response.json({
    success: true,
    vo,
    items: items.results || []
  });
}
