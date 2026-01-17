export async function onRequestGet({ request, env }) {

  /* ===== AUTH CHECK ===== */
  const authRes = await fetch(new URL("/api/auth-check", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" }
  });
  if (!authRes.ok) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

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

  const whereSQL = where.length ? "WHERE " + where.join(" AND ") : "";

  /* ===== PER SUPPLIER ===== */
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

  /* ===== OVERALL ===== */
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

  return new Response(
    JSON.stringify({
      overall,
      rows: rows.results
    }),
    { status: 200 }
  );
}
