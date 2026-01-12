export async function onRequestPost({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { id, customer, items } = await request.json();

  if (!id || !customer || !Array.isArray(items)) {
    return new Response(JSON.stringify({ error: "Invalid data" }), { status: 400 });
  }

  // 只能编辑 UNPAID
  const invoice = await env.DB.prepare(
    "SELECT status FROM invoices WHERE id=?"
  ).bind(id).first();

  if (!invoice || invoice.status !== "UNPAID") {
    return new Response(JSON.stringify({ error: "Invoice cannot be edited" }), { status: 400 });
  }

  // 重新算 total
  const total = items.reduce((s, i) => s + i.qty * i.price, 0);

  // 更新 invoice
  await env.DB.prepare(
    "UPDATE invoices SET customer=?, amount=? WHERE id=?"
  ).bind(customer, total, id).run();

  // 删除旧 items（允许，属于 invoice 子项）
  await env.DB.prepare(
    "DELETE FROM invoice_items WHERE invoice_id=?"
  ).bind(id).run();

  // 插入新 items
  for (const it of items) {
    await env.DB.prepare(
      "INSERT INTO invoice_items (invoice_id, description, qty, price) VALUES (?, ?, ?, ?)"
    ).bind(id, it.description, it.qty, it.price).run();
  }

  return new Response(JSON.stringify({ success: true }));
}
