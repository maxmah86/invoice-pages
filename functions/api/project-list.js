export async function onRequestGet({ request, env }) {

  /* ===============================
     1. AUTH CHECK
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
     2. OPTIONAL FILTERS
     ?status=ACTIVE   (default: all)
     ?q=keyword       (search project_name or client_name)
     =============================== */
  const url = new URL(request.url);
  const status      = url.searchParams.get("status");
  const q           = url.searchParams.get("q");
  const start_year  = url.searchParams.get("start_year");
  const start_month = url.searchParams.get("start_month");

  let sql = `
    SELECT
      p.id,
      p.project_no,
      p.project_name,
      p.client_name,
      p.project_type,
      p.contract_value,
      p.start_date,
      p.status,
      p.notes,
      p.created_at,

      -- Invoice summary
      IFNULL((
        SELECT SUM(amount)
        FROM invoices
        WHERE project_id = p.id
          AND status != 'VOID'
      ), 0) AS total_invoiced,

      IFNULL((
        SELECT SUM(amount)
        FROM invoices
        WHERE project_id = p.id
          AND status = 'PAID'
      ), 0) AS total_collected,

      -- PO summary
      IFNULL((
        SELECT SUM(total)
        FROM purchase_orders
        WHERE project_id = p.id
          AND status != 'VOID'
      ), 0) AS total_po

    FROM projects p
    WHERE 1 = 1
  `;

  const params = [];

  if (status) {
    sql += " AND p.status = ?";
    params.push(status);
  }

  if (start_month) {
    // Filter by specific month e.g. "2026-03"
    sql += " AND substr(p.start_date, 1, 7) = ?";
    params.push(start_month);
  } else if (start_year) {
    // Filter by full year e.g. "2026"
    sql += " AND substr(p.start_date, 1, 4) = ?";
    params.push(start_year);
  }

  if (q) {
    sql += " AND (p.project_name LIKE ? OR p.client_name LIKE ? OR p.project_no LIKE ?)";
    const kw = `%${q}%`;
    params.push(kw, kw, kw);
  }

  sql += " ORDER BY p.created_at DESC";

  /* ===============================
     3. QUERY
     =============================== */
  try {
    const { results } = await env.DB.prepare(sql).bind(...params).all();

    return new Response(
      JSON.stringify(results || []),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Database error: " + err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
