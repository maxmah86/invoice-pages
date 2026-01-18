export async function onRequestPost({ request, env }) {
  try {
    /* ===== AUTH CHECK ===== */
    const cookie = request.headers.get("Cookie") || "";
    const session = await env.DB
      .prepare("SELECT id FROM users WHERE session_token = ?")
      .bind(cookie.replace("session=", ""))
      .first();

    if (!session) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401
      });
    }

    /* ===== INPUT ===== */
    const body = await request.json();

    const issued_by = body.issued_by || "";
    const supplier_name = body.supplier_name || "";
    const delivery_address = body.delivery_address || "";
    const delivery_date = body.delivery_date || "";
    const delivery_time = body.delivery_time || "";
    const notes = body.notes || "";

    if (!supplier_name) {
      return new Response(JSON.stringify({ error: "Supplier required" }), {
        status: 400
      });
    }

    /* ===== AUTO PO NO ===== */
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const rand = Math.floor(1000 + Math.random() * 9000);

    const po_no = `PO${yyyy}${mm}${dd}${rand}`;
    const po_date = now.toISOString().slice(0, 10);

    /* ===== INSERT ===== */
    await env.DB.prepare(`
      INSERT INTO purchase_orders (
        po_no,
        po_date,
        issued_by,
        supplier_name,
        delivery_address,
        delivery_date,
        delivery_time,
        notes,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      po_no,
      po_date,
      issued_by,
      supplier_name,
      delivery_address,
      delivery_date,
      delivery_time,
      notes,
      "DRAFT"
    ).run();

    return new Response(JSON.stringify({
      success: true,
      po_no
    }), { status: 200 });

  } catch (err) {
    return new Response(JSON.stringify({
      error: "PO create failed",
      detail: String(err)
    }), { status: 500 });
  }
}
