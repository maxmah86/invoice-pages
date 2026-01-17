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

  const { id, supplier_name, items } = body;

  if (!id || !supplier_name || !Array.isArray(items)) {
    return new Response(
      JSON.stringify({ error: "Missing required fields" }),
      { status: 400 }
    );
  }

  /* ===============================
     LOAD EXISTING PO
     (optional: block edit if not OPEN)
     =============================== */
  const po = await env.DB.prepare(`
    SELECT status
    FROM purchase_orders
    WHERE id = ?
  `).bind(id).first();

  if (!po) {
    return new Response(
      JSON.stringify({ error: "PO not found" }),
      { status: 404 }
    );
  }

  // 可选：只允许 OPEN 状态编辑
  if (po.status !== "OPEN") {
    return new Response(
      JSON.stringify({ error: "PO not editable" }),
      { status: 403 }
    );
  }

  /* ===============================
     RE-CALCULATE TOTALS
     =============================== */
  let subtotal = 0;

  const normalizedItems = items.map(it => {
    const qty = Number(it.qty) || 0;
    const unit = Number(it.unit_price) || 0;
    const line = qty * unit;
    subtotal += line;

    return {
      description: it.description || "",
      qty,
      unit_price: unit,
      line_total: line
    };
  });

  const total = subtotal;

  /* ===============================
     UPDATE PO HEADER
     =============================== */
  await env.DB.prepare(`
    UPDATE purchase_orders
    SET supplier_name = ?,
        subtotal = ?,
        total = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    supplier_name,
    subtotal,
    total,
    id
  ).run();

  /* ===============================
     REPLACE ITEMS
     =============================== */
  await env.DB.prepare(`
    DELETE FROM purchase_order_items
    WHERE purchase_order_id = ?
  `).bind(id).run();

  const insertItem = env.DB.prepare(`
    INSERT INTO purchase_order_items
      (purchase_order_id, description, qty, unit_price, line_total)
    VALUES
      (?, ?, ?, ?, ?)
  `);

  for (const it of normalizedItems) {
    await insertItem.bind(
      id,
      it.description,
      it.qty,
      it.unit_price,
      it.line_total
    ).run();
  }

  /* ===============================
     RESPONSE
     =============================== */
  return new Response(
    JSON.stringify({ success: true }),
    { status: 200 }
  );
}
