export async function onRequestPost({ request, env }) {
  try {
    /* ===== BASIC AUTH CHECK =====
       如果你已经能进 po.html，
       这里不再重复查 users 表 */
    const cookie = request.headers.get("Cookie") || "";
    if (!cookie.includes("session=")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    /* ===== READ BODY ===== */
    const body = await request.json();
    const {
      supplier_name,
      delivery_address,
      delivery_date,
      delivery_time,
      notes,
      items
    } = body;

    if (!supplier_name) {
      return new Response(JSON.stringify({ error: "Supplier name required" }), { status: 400 });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "No items" }), { status: 400 });
    }

    /* ===== CALCULATE TOTAL ===== */
    let subtotal = 0;
    items.forEach(i => {
      subtotal += Number(i.qty || 0) * Number(i.price || 0);
    });

    const total = subtotal;

    /* ===== INSERT PO ===== */
    const r = await env.DB.prepare(`
      INSERT INTO purchase_orders (
        supplier_name,
        delivery_address,
        delivery_date,
        delivery_time,
        notes,
        issued_by,
        subtotal,
        total,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', datetime('now'))
    `).bind(
      supplier_name,
      delivery_address || null,
      delivery_date || null,
      delivery_time || null,
      notes || null,
      "MMAC SYSTEM",
      subtotal,
      total
    ).run();

    return new Response(JSON.stringify({
      success: true,
      id: r.lastRowId
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      error: "PO create failed",
      detail: String(err)
    }), { status: 500 });
  }
}
