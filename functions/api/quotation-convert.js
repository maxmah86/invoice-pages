export async function onRequestPost({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok"))
    return new Response("Unauthorized", { status: 401 });

  const { quotation_id } = await request.json();

  const q = await env.DB.prepare(
    "SELECT * FROM quotations WHERE id=? AND status='OPEN'"
  ).bind(quotation_id).first();

  if (!q) return new Response("Invalid quotation", { status: 400 });

  const items = await env.DB.prepare(
    "SELECT * FROM quotation_items WHERE quotation_id=?"
  ).bind(quotation_id).all();

  // 👉 这里直接复用你现有 invoice-create 逻辑
  // 插入 invoices + invoice_items（略，你已经有）

  await env.DB.prepare(
    "UPDATE quotations SET status='ACCEPTED' WHERE id=?"
  ).bind(quotation_id).run();

  return Response.json({ success: true });
}
