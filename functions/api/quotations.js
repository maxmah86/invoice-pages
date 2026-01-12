export async function onRequest({ request, env }) {
  // ===== 登录检查 =====
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  // ===== 查询 quotations =====
  const result = await env.DB.prepare(`
    SELECT
      id,
      quotation_no,
      customer,
      amount,
      status
    FROM quotations
    ORDER BY id DESC
  `).all();

  return new Response(
    JSON.stringify(result.results),
    { headers: { "Content-Type": "application/json" } }
  );
}
