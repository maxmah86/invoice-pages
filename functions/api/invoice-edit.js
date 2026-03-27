export async function onRequestPost({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const user = await env.DB.prepare(`SELECT role FROM users WHERE session_token = ?`).bind(token).first();
  if (!user || user.role !== "admin") return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });

  let body;
  try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

  const { id, customer, items, invoice_date } = body;
  if (!id || !customer || !Array.isArray(items)) return new Response("Invalid data", { status: 400 });

  // 检查状态：只有 UNPAID 才能编辑
  const invoice = await env.DB.prepare(`SELECT status FROM invoices WHERE id = ?`).bind(id).first();
  if (!invoice || invoice.status !== "UNPAID") {
    return new Response(JSON.stringify({ error: "Invoice is locked or not found" }), { status: 400 });
  }

  // 计算总额
  let total = 0;
  const validItems = items.filter(it => it.description && it.qty > 0);
  validItems.forEach(it => { total += Number(it.qty) * Number(it.price); });

  const createdAt = (invoice_date || new Date().toISOString().slice(0, 10)) + " 00:00:00";

  // 使用 Batch 确保原子性：更新主表 + 删除旧项 + 插入新项
  const statements = [
    env.DB.prepare(`UPDATE invoices SET customer = ?, amount = ?, created_at = ? WHERE id = ?`)
      .bind(customer, total, createdAt, id),
    env.DB.prepare(`DELETE FROM invoice_items WHERE invoice_id = ?`).bind(id)
  ];

  validItems.forEach(it => {
    statements.push(
      env.DB.prepare(`INSERT INTO invoice_items (invoice_id, description, qty, price) VALUES (?, ?, ?, ?)`)
        .bind(id, it.description, it.qty, it.price)
    );
  });

  await env.DB.batch(statements);

  return new Response(JSON.stringify({ success: true }));
}
