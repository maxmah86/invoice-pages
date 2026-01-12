export async function onRequest({ request, env }) {
  /* ===== 登录检查 ===== */
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  /* ===== 读取参数 ===== */
  const url = new URL(request.url);
  const customer = url.searchParams.get("customer"); // 可为空
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  /* ===== 动态 SQL ===== */
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
    sql += " AND customer = ?";
    binds.push(customer);
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

  /* ===== 查询 D1 ===== */
  const result = await env.DB.prepare(sql).bind(...binds).all();

  /* ===== 统一返回 ===== */
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
