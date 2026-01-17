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
    po_no,
    po_date,
    supplier_name,
    supplier_address,
    subtotal,
    total,
    items
  } = body;

  if (!po_no || !po_date || !supplier_name || !Array.isArray(items)) {
    return new Response(
      JSON.stringify({ error: "Missing required fields" }),
      { status: 400 }
    );
  }

  /* ===============================
     INSERT PO (HEADER)
     =============================== */
  const poResult = await env.DB.prepare(`
    INSERT INTO purchase_orders
      (po_no, po_date, supplier_name, supplier_address, subtotal, total, status)
    VALUES
      (?, ?, ?, ?, ?, ?, 'OPEN')
  `).bind(
    po_no,
    po_date,
    supplier_name,
    supplier_address || "",
    subtotal || 0,
    total || 0
  ).run();

  const purchaseOrderId = poResult.meta.last_row_id;

  /* ===============================
     INSERT ITEMS
     =============================== */
  const stmt = env.DB.prepare(`
    INSERT INTO purchase_order_items
      (purchase_order_id, description, qty, unit_price, line_total)
    VALUES
      (?, ?, ?, ?, ?)
  `);

  for (const item of items) {
    await stmt.bind(
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
