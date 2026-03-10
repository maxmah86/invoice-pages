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
    const url = new URL(request.url);
    const project_id = url.searchParams.get("project_id");
    const status     = url.searchParams.get("status");

    let sql = `
      SELECT
        id,
        po_no,
        po_date,
        supplier_name,
        delivery_date,
        delivery_time,
        total,
        status,
        project_id,
        created_at
      FROM purchase_orders
      WHERE 1 = 1
    `;

    const params = [];

    if (project_id) {
      sql += " AND project_id = ?";
      params.push(project_id);
    }

    if (status) {
      sql += " AND status = ?";
      params.push(status);
    }

    sql += " ORDER BY created_at DESC";

    const { results } = await env.DB.prepare(sql).bind(...params).all();

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
