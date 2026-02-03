export async function onRequestGet(context) {
  const { request, env } = context;
  const db = env.DB;

  const { searchParams } = new URL(request.url);
  const customer  = searchParams.get("customer");
  const status    = searchParams.get("status");
  const date_from = searchParams.get("date_from");
  const date_to   = searchParams.get("date_to");

  /* ===============================
   * Admin auth
   * =============================== */
  const authRes = await fetch(new URL("/api/auth-check", request.url), {
    headers: { Cookie: request.headers.get("Cookie") || "" }
  });
  const auth = await authRes.json();

  if (!auth.loggedIn || auth.role !== "admin") {
    return jsonError("Permission denied", 403);
  }

  try {
    /* ===============================
     * Base SQL (INVOICES)
     * =============================== */
    let sql = `
      SELECT
        id,
        invoice_no,
        customer,
        created_at,
        amount,
        status
      FROM invoices
      WHERE 1 = 1
    `;

    const binds = [];

    /* ===============================
     * Customer keyword
     * =============================== */
    if (customer) {
      sql += " AND customer LIKE ?";
      binds.push(`%${customer}%`);
    }

    /* ===============================
     * Status keyword (你要的效果)
     * =============================== */
    if (status) {
      sql += " AND status LIKE ?";
      binds.push(`%${status}%`);
    }

    /* ===============================
     * Date range
     * =============================== */
    if (date_from) {
      sql += " AND date(created_at) >= date(?)";
      binds.push(date_from);
    }

    if (date_to) {
      sql += " AND date(created_at) <= date(?)";
      binds.push(date_to);
    }

    sql += " ORDER BY created_at DESC";

    const res = await db.prepare(sql).bind(...binds).all();

    return jsonOK(res.results || []);

  } catch (err) {
    console.error(err);
    return jsonError(err.message || "Failed to load statement", 500);
  }
}

/* ===============================
 * Helpers
 * =============================== */
function jsonOK(data) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { "Content-Type": "application/json" }
  });
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
