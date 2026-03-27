export async function onRequestPost({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];
  if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const user = await env.DB.prepare(`SELECT id, role FROM users WHERE session_token = ?`).bind(token).first();
  if (!user || user.role !== "admin") return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });

  const data = await request.json();
  const { project_id, customer, items, invoice_date } = data;

  const targetDate = invoice_date || new Date().toISOString().slice(0, 10);
  const prefix = "INV-" + targetDate.replace(/-/g, "").slice(2, 8) + "-";

  const maxRow = await env.DB.prepare(`SELECT MAX(invoice_no) AS max_no FROM invoices WHERE invoice_no LIKE ?`).bind(prefix + "%").first();
  let seq = 1;
  if (maxRow?.max_no) seq = parseInt(maxRow.max_no.slice(-4), 10) + 1;
  const invoiceNo = `${prefix}${String(seq).padStart(4, "0")}`;

  let total = 0;
  items.forEach(it => { total += Number(it.qty) * Number(it.price); });

  // 使用 Batch 事务
  const invInsert = env.DB.prepare(`
    INSERT INTO invoices (invoice_no, customer, amount, status, project_id, created_at)
    VALUES (?, ?, ?, 'UNPAID', ?, ?)
  `).bind(invoiceNo, customer, total, project_id || null, targetDate + " 00:00:00");

  const result = await env.DB.batch([
    invInsert,
    ...items.map(it => env.DB.prepare(`INSERT INTO invoice_items (invoice_id, description, qty, price) VALUES (LAST_INSERT_ROWID(), ?, ?, ?)`).bind(it.description, it.qty, it.price))
  ]);

  return new Response(JSON.stringify({ success: true, id: result[0].meta.last_row_id }), { status: 200 });
}
