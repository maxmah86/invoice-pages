export async function onRequest({ request, env }) {

  /* ===============================
     AUTH CHECK (ADMIN ONLY)
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  const user = await env.DB.prepare(`
    SELECT id, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user || user.role !== "admin") {
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403 }
    );
  }

  /* ===============================
     READ PARAMS
     =============================== */
  const url = new URL(request.url);
  const customer = url.searchParams.get("customer"); // optional
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  /* ===============================
     BUILD SQL
     =============================== */
  let sql = `
    SELECT
      id,
      invoice_no,
      customer,
      created_at,
      amount,
      status
    FROM invoices
    WHERE 1=1
  `;
  const binds = [];

  if (customer) {
      sql += " AND customer LIKE ?";
      binds.push(`%${customer}%`);
    }

  if (from) {
    sql += " AND date(created_at) >= date(?)";
    binds.push(from);
  }

  if (to) {
    sql += " AND date(created_at) <= date(?)";
    binds.push(to);
  }

  sql += " ORDER BY customer ASC, created_at ASC";

  /* ===============================
     QUERY DB
     =============================== */
  const result = await env.DB.prepare(sql).bind(...binds).all();

  /* ===============================
     RESPONSE
     =============================== */
  return new Response(
    JSON.stringify({
      invoices: result.results || []
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );
}
