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

  // 1️⃣ 插入 invoices
  const inv = await env.DB.prepare(
    "INSERT INTO invoices (customer, amount, created_at) VALUES (?, ?, datetime('now'))"
  ).bind(customer, total).run();

  const invoiceId = inv.meta.last_row_id;

  // 2️⃣ 插入 invoice_items
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
      total
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
