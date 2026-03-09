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
     2. FILTERS
     ?project_id=X   (required for project view)
     ?status=PAID     (optional)
     =============================== */
  const url = new URL(request.url);
  const project_id = url.searchParams.get("project_id");
  const status     = url.searchParams.get("status");

  let sql = `
    SELECT
      id,
      invoice_no,
      customer,
      amount,
      status,
      created_at
    FROM invoices
    WHERE (status IS NULL OR status != 'VOID')
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
