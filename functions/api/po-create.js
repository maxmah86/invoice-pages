export async function onRequestPost({ request, env }) {
  try {
    /* ===== AUTH CHECK ===== */
    const cookie = request.headers.get("Cookie") || "";
    const token = cookie
      .split(";")
      .find(c => c.trim().startsWith("session="))
      ?.split("=")[1];

    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const user = await env.DB
      .prepare("SELECT id, username FROM users WHERE session_token = ?")
      .bind(token)
      .first();

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    /* ===== BODY ===== */
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

    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ error: "No items" }), { status: 400 });
    }

    /* ===== CALC TOTAL ===== */
    let subtotal = 0;
    items.forEach(i => {
      subtotal += Number(i.qty || 0) * Number(i.price || 0);
    });

    const total = subtotal;

    /* ===== INSERT PO ===== */
    const result = await env.DB.prepare(`
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
      user.username,
      subtotal,
      total
    ).run();

    return new Response(JSON.stringify({
      success: true,
      id: result.lastRowId
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      error: "PO create failed",
      detail: String(err)
    }), {
      status: 500
    });
  }
}
