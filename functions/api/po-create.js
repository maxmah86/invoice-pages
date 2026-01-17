export async function onRequestPost({ request, env }) {

  /* ===============================
     AUTH CHECK
     =============================== */
  const authRes = await fetch(new URL("/api/auth-check", request.url), {
    headers: {
      cookie: request.headers.get("cookie") || ""
    }
  });

  if (!authRes.ok) {
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
    supplier_address,
    subtotal,
    total,
    items
  } = body;

  if (!supplier_name || !Array.isArray(items) || items.length === 0) {
    return new Response(
      JSON.stringify({ error: "Missing required fields" }),
      { status: 400 }
    );
  }

  /* ===============================
     INSERT PO HEADER
     (po_no & po_date from SQL DEFAULT)
     =============================== */
  const poResult = await env.DB.prepare(`
    INSERT INTO purchase_orders
      (supplier_name, supplier_address, subtotal, total, status)
    VALUES
      (?, ?, ?, ?, 'OPEN')
  `).bind(
    supplier_name,
    supplier_address || "",
    subtotal || 0,
    total || 0
  ).run();

  const purchaseOrderId = poResult.meta.last_row_id;

  /* ===============================
     INSERT PO ITEMS
     =============================== */
  const itemStmt = env.DB.prepare(`
    INSERT INTO purchase_order_items
      (purchase_order_id, description, qty, unit_price, line_total)
    VALUES
      (?, ?, ?, ?, ?)
  `);

  for (const item of items) {
    await itemStmt.bind(
      purchaseOrderId,
      item.description || "",
      item.qty || 0,
      item.unit_price || 0,
      item.line_total || 0
    ).run();
  }

  /* ===============================
     RESPONSE
     =============================== */
  return new Response(
    JSON.stringify({
      success: true,
      purchase_order_id: purchaseOrderId
    }),
    { status: 200 }
  );
}
