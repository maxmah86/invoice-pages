export async function onRequestGet({ request, env }) {
  try {
    /* ===== BASIC AUTH CHECK ===== */
    const cookie = request.headers.get("Cookie") || "";
    if (!cookie.includes("session=")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401
      });
    }

    /* ===== QUERY PO LIST ===== */
    const { results } = await env.DB.prepare(`
      SELECT
        id,
        po_no,
        po_date,
        supplier_name,
        delivery_date,
        delivery_time,
        total,
        status,
        created_at
      FROM purchase_orders
      ORDER BY created_at DESC
    `).all();

    return new Response(JSON.stringify({ results }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      error: "PO list failed",
      detail: String(err)
    }), {
      status: 500
    });
  }
}
