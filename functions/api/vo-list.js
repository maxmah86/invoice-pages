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
     QUERY PARAMS
     =============================== */
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const quotation_id = url.searchParams.get("quotation_id");
  const invoice_id = url.searchParams.get("invoice_id");
  const month = url.searchParams.get("month");
  const q = url.searchParams.get("q");

  let sql = `
    SELECT
      id,
      vo_no,
      quotation_id,
      invoice_id,
      title,
      reason,
      status,
      amount,
      created_at
    FROM variation_orders
    WHERE 1 = 1
  `;

  const params = [];

  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }

  if (quotation_id) {
    sql += " AND quotation_id = ?";
    params.push(quotation_id);
  }

  if (invoice_id) {
    sql += " AND invoice_id = ?";
    params.push(invoice_id);
  }

  if (month) {
    sql += " AND substr(created_at, 1, 7) = ?";
    params.push(month);
  }

  if (q) {
    sql += " AND (vo_no LIKE ? OR title LIKE ? OR reason LIKE ?)";
    const kw = `%${q}%`;
    params.push(kw, kw, kw);
  }

  sql += " ORDER BY created_at DESC";

  /* ===============================
     EXECUTE
     =============================== */
  const result = await env.DB.prepare(sql).bind(...params).all();

  return Response.json({
    success: true,
    rows: result.results || []
  });
}
