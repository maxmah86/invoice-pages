export async function onRequest({ request, env }) {
  // ===== 登录检查 =====
  const cookie = request.headers.get("Cookie") || "";
  const loggedIn = cookie
    .split(";")
    .map(c => c.trim())
    .includes("session=ok");

  if (!loggedIn) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", loggedIn: false }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );
  }

  // ===== 读取 invoice id =====
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return new Response(
      JSON.stringify({ error: "Missing invoice id" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  // ===== 读取 invoice 主表 =====
  const invoice = await env.DB.prepare(
    `
    SELECT
      id,
      invoice_no,
      customer,
      amount,
      status,
      created_at
    FROM invoices
    WHERE id = ?
    `
  ).bind(id).first();

  if (!invoice) {
    return new Response(
      JSON.stringify({ error: "Invoice not found" }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  // ===== 读取 invoice_items =====
  const itemsResult = await env.DB.prepare(
    `
    SELECT
      description,
      qty,
      price
    FROM invoice_items
    WHERE invoice_id = ?
    ORDER BY id ASC
    `
  ).bind(id).all();

  // ===== 正常返回 =====
  return new Response(
    JSON.stringify({
      invoice,
      items: itemsResult.results || []
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );
}
