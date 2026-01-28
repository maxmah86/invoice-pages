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

    /* ===== ROLE CHECK ===== */
    if (user.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    /* ===============================
       FILTERS
       =============================== */
    const { searchParams } = new URL(request.url);
    const supplier = searchParams.get("supplier");
    const status = searchParams.get("status");

    const where = [];
    const bind = [];

    if (supplier) {
      where.push("supplier_name LIKE ?");
      bind.push(`%${supplier}%`);
    }

    if (status) {
      where.push("status = ?");
      bind.push(status);
    }

    const whereSQL = where.length
      ? "WHERE " + where.join(" AND ")
      : "";

    /* ===============================
       PER SUPPLIER SUMMARY
       =============================== */
    const rows = await env.DB.prepare(`
      SELECT
        supplier_name,
        COUNT(*) AS total_po,
        SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) AS approved_count,
        SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END) AS closed_count,
        SUM(total) AS total_amount
      FROM purchase_orders
      ${whereSQL}
      GROUP BY supplier_name
      ORDER BY supplier_name
    `).bind(...bind).all();

    /* ===============================
       OVERALL SUMMARY
       =============================== */
    const overall = await env.DB.prepare(`
      SELECT
        COUNT(*) AS total_po,
        SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) AS approved_count,
        SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END) AS closed_count,
        SUM(total) AS total_amount
      FROM purchase_orders
      ${whereSQL}
    `).bind(...bind).first();

    /* ===============================
       RESPONSE
       =============================== */
    return new Response(
      JSON.stringify({
        overall,
        rows: rows.results,
        viewer: {
          username: user.username,
          role: user.role
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "PO summary failed",
        detail: String(err)
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
