export async function onRequestPost({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400 }
    );
  }

  const { customer, items } = data;
  if (!customer || !Array.isArray(items) || items.length === 0) {
    return new Response(
      JSON.stringify({ error: "Invalid data" }),
      { status: 400 }
    );
  }

  // 计算 total
  const total = items.reduce(
    (sum, it) => sum + (Number(it.qty) || 0) * (Number(it.price) || 0),
    0
  );

  // ===== 生成 Invoice No =====
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const dateStr = `${y}${m}${d}`;

  // 当天已有多少张
  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM invoices WHERE date(created_at)=date('now')"
  ).first();

  const seq = String((countRow.cnt || 0) + 1).padStart(4, "0");
  const invoiceNo = `INV-${dateStr}-${seq}`;

  // 插入 invoices
  const inv = await env.DB.prepare(
    `INSERT INTO invoices
     (invoice_no, customer, amount, status, created_at)
     VALUES (?, ?, ?, 'UNPAID', datetime('now'))`
  ).bind(invoiceNo, customer, total).run();

  const invoiceId = inv.meta.last_row_id;

  // 插入 items
  for (const it of items) {
    await env.DB.prepare(
      "INSERT INTO invoice_items (invoice_id, description, qty, price) VALUES (?, ?, ?, ?)"
    ).bind(
      invoiceId,
      it.description,
      Number(it.qty),
      Number(it.price)
    ).run();
  }

  return new Response(
    JSON.stringify({
      success: true,
      invoice_id: invoiceId,
      invoice_no: invoiceNo
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
