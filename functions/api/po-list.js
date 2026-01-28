export async function onRequestGet({ request, env }) {
  try {
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
       QUERY PO LIST
       =============================== */
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

    /* ===============================
       RESPONSE
       =============================== */
    return new Response(
      JSON.stringify({
        items: results,
        viewer: {
          username: user.username,
          role: user.role
        }
      }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "PO list failed",
        detail: String(err)
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
