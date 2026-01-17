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
     QUERY PO LIST
     =============================== */
  const result = await env.DB.prepare(`
    SELECT
      id,
      po_no,
      po_date,
      supplier_name,
      total,
      status
    FROM purchase_orders
    ORDER BY id DESC
    LIMIT 100
  `).all();

  /* ===============================
     RESPONSE
     =============================== */
  return new Response(
    JSON.stringify(result.results),
    { status: 200 }
  );
}
