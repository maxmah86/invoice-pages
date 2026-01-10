export async function onRequest({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";

  if (!cookie.includes("session=ok")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  const result = await env.DB.prepare(`
    SELECT
      id,
      invoice_no,
      customer,
      amount,
      status,
      created_at
    FROM invoices
    ORDER BY id DESC
  `).all();

  return new Response(
    JSON.stringify(result.results),
    {
      headers: { "Content-Type": "application/json" }
    }
  );
}
