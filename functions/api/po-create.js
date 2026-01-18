export async function onRequestPost({ request, env }) {
  try {
    /* ===== AUTH CHECK ===== */
    const cookie = request.headers.get("Cookie") || "";
    const token = cookie
      .split(";")
      .find(c => c.trim().startsWith("session="))
      ?.split("=")[1];

    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401
      });
    }

    const user = await env.DB
      .prepare("SELECT id FROM users WHERE session_token = ?")
      .bind(token)
      .first();

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401
      });
    }

    /* ===== INPUT ===== */
    const body = await request.json();

    const supplier_name = body.supplier_name || "";
    const supplier_address = body.supplier_address || "";

    const issued_by = body.issued_by || "";
    const delivery_address = body.delivery_address || "";
    const delivery_date = body.delivery_date || "";
    const delivery_time = body.delivery_time || "";
    const notes = body.notes || "";

    if (!supplier_name) {
      return new Response(JSON.stringify({ error: "Supplier required" }), {
        status: 400
      });
    }

    /* ===== INSERT ===== */
    const result = await env.DB.prepare(`
      INSERT INTO purchase_orders (
        supplier_name,
        supplier_address,
        issued_by,
        delivery_address,
        delivery_date,
        delivery_time,
        notes,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      supplier_name,
      supplier_address,
      issued_by,
      delivery_address,
      delivery_date,
      delivery_time,
      notes
    ).run();

    /* ===== RETURN CREATED PO ===== */
    const po = await env.DB.prepare(`
      SELECT po_no, po_date, status
      FROM purchase_orders
      WHERE id = ?
    `).bind(result.meta.last_row_id).first();

    return new Response(JSON.stringify({
      success: true,
      po
    }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({
      error: "PO create failed",
      detail: String(err)
    }), { status: 500 });
  }
}
