export async function onRequestGet({ request, env }) {

  /* ===============================
     AUTH CHECK
     =============================== */
  const authRes = await fetch(new URL("/api/auth-check", request.url), {
    headers: {
      cookie: request.headers.get("cookie") || ""
    }
  });

  if (!authRes.ok) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  /* ===============================
     QUERY SUMMARY
     =============================== */
  const result = await env.DB.prepare(`
    SELECT
      supplier_name,
      COUNT(*) AS total_po,
      SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) AS open_count,
      SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) AS approved_count,
      SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END) AS closed_count,
      SUM(total) AS total_amount
    FROM purchase_orders
    GROUP BY supplier_name
    ORDER BY supplier_name ASC
  `).all();

  /* ===============================
     RESPONSE
     =============================== */
  return new Response(
    JSON.stringify(result.results),
    { status: 200 }
  );
}
