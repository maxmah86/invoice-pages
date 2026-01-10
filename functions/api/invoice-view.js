export async function onRequest({ request, env }) {
  // ===== 登录检查 =====
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  // ===== 读取 invoice id =====
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return new Response(
      JSON.stringify({ error: "Missing invoice id" }),
      { status: 400 }
    );
  }

  // ===== 读取 invoice 主表（含 invoice_no）=====
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
      { status: 404 }
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

  // ===== 返回 JSON =====
  return new Response(
    JSON.stringify({
      invoice,
      items: itemsResult.results
    }),
    {
      headers: { "Content-Type": "application/json" }
    }
  );
}
