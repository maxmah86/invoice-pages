export async function onRequestPost({ request, env }) {

  /* ===== AUTH ===== */
  const auth = await fetch(new URL("/api/auth-check", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" }
  });
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await request.json();
  const {
    supplier_name,
    supplier_address,
    issued_by,
    delivery_address,
    delivery_date,
    delivery_time,
    notes,
    items
  } = body;

  if (!supplier_name || !Array.isArray(items) || items.length === 0) {
    return new Response(JSON.stringify({ error: "Invalid data" }), { status: 400 });
  }

  /* ===== CALCULATE TOTAL ===== */
  let total = 0;
  items.forEach(it => {
    total += Number(it.qty) * Number(it.price);
  });

  /* ===== INSERT PO HEADER ===== */
  const r = await env.DB.prepare(`
    INSERT INTO purchase_orders (
      supplier_name,
      supplier_address,
      issued_by,
      delivery_address,
      delivery_date,
      delivery_time,
      notes,
      total,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')
  `).bind(
    supplier_name,
    supplier_address || "",
    issued_by || "MMAC SYSTEM",
    delivery_address || "",
    delivery_date || "",
    delivery_time || "",
    notes || "",
    total
  ).run();

  const poId = r.meta.last_row_id;

  /* ===== INSERT ITEMS ===== */
  for (const it of items) {
    await env.DB.prepare(`
      INSERT INTO purchase_order_items (
        purchase_order_id,
        description,
        qty,
        unit_price
      ) VALUES (?, ?, ?, ?)
    `).bind(
      poId,
      it.description,
      Number(it.qty),
      Number(it.price)
    ).run();
  }

  return new Response(
    JSON.stringify({ success: true, id: poId }),
    { headers: { "Content-Type": "application/json" } }
  );
}
