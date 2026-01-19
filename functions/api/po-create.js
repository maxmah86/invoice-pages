export async function onRequestPost({ request, env }) {

  /* ===============================
     AUTH CHECK
     =============================== */
  const auth = await fetch(new URL("/api/auth-check", request.url), {
    headers: {
      cookie: request.headers.get("cookie") || ""
    }
  });

  if (!auth.ok) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  /* ===============================
     PARSE BODY
     =============================== */
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400 }
    );
  }

  const {
    supplier_name,
    issued_by,
    delivery_address,
    delivery_date,
    delivery_time,
    notes,
    items
  } = body;

  if (
    !supplier_name ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return new Response(
      JSON.stringify({ error: "Invalid data" }),
      { status: 400 }
    );
  }

  /* ===============================
     CALCULATE SUBTOTAL & TOTAL
     =============================== */
  let subtotal = 0;

  for (const it of items) {
    const qty = Number(it.qty) || 0;
    const price = Number(it.price) || 0;
    subtotal += qty * price;
  }

  const total = subtotal;

  /* ===============================
     INSERT PO HEADER
     =============================== */
  const insertPO = await env.DB.prepare(`
    INSERT INTO purchase_orders (
      supplier_name,
      issued_by,
      delivery_address,
      delivery_date,
      delivery_time,
      notes,
      subtotal,
      total,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')
  `).bind(
    supplier_name,
    issued_by || "MMAC SYSTEM",
    delivery_address || "",
    delivery_date || "",
    delivery_time || "",
    notes || "",
    subtotal,
    total
  ).run();

  const poId = insertPO.meta.last_row_id;

  /* ===============================
     INSERT PO ITEMS
     =============================== */
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
      it.description || "",
      Number(it.qty) || 0,
      Number(it.price) || 0
    ).run();
  }

  /* ===============================
     RESPONSE
     =============================== */
  return new Response(
    JSON.stringify({
      success: true,
      id: poId
    }),
    {
      headers: { "Content-Type": "application/json" }
    }
  );
}
