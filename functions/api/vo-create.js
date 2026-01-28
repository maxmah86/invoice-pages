export async function onRequestPost({ request, env }) {

  /* ===============================
     AUTH CHECK (session_token)
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = await env.DB.prepare(`
    SELECT id, username, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  /* ===== ADMIN / STAFF ONLY ===== */
  if (!["admin", "staff"].includes(user.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  /* ===============================
     PARSE BODY
     =============================== */
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const {
    quotation_id,
    invoice_id,
    title,
    reason,
    notes,
    items
  } = body;

  if (!Array.isArray(items) || items.length === 0) {
    return new Response("Invalid items", { status: 400 });
  }

  /* ===== MUST LINK TO ONE SOURCE ===== */
  if (!quotation_id && !invoice_id) {
    return new Response(
      "VO must link to quotation or invoice",
      { status: 400 }
    );
  }

  /* ===============================
     CALCULATE AMOUNT
     =============================== */
  let amount = 0;
  for (const i of items) {
    amount += (Number(i.qty) || 0) * (Number(i.unit_price) || 0);
  }

  if (amount <= 0) {
    return new Response("Invalid amount", { status: 400 });
  }

  /* ===============================
     GENERATE VO NO
     =============================== */
  const d = new Date();
  const date = d.toISOString().slice(0,10).replace(/-/g,"");

  const cnt = await env.DB.prepare(`
    SELECT COUNT(*) AS c
    FROM variation_orders
    WHERE date(created_at) = date('now')
  `).first();

  const vo_no = `VO-${date}-${String(cnt.c + 1).padStart(4,"0")}`;

  /* ===============================
     INSERT VO HEADER
     =============================== */
  const r = await env.DB.prepare(`
    INSERT INTO variation_orders (
      vo_no,
      quotation_id,
      invoice_id,
      title,
      reason,
      amount,
      status,
      notes,
      created_at,
      created_by
    ) VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?, datetime('now'), ?)
  `).bind(
    vo_no,
    quotation_id || null,
    invoice_id || null,
    title || "Variation Order",
    reason || "",
    amount,
    notes || "",
    user.username
  ).run();

  const vo_id = r.meta.last_row_id;

  /* ===============================
     INSERT VO ITEMS
     =============================== */
  const stmt = env.DB.prepare(`
    INSERT INTO variation_order_items (
      variation_order_id,
      description,
      qty,
      unit_price,
      line_total
    ) VALUES (?, ?, ?, ?, ?)
  `);

  for (const i of items) {
    const qty = Number(i.qty) || 0;
    const price = Number(i.unit_price) || 0;

    await stmt.bind(
      vo_id,
      i.description || "",
      qty,
      price,
      qty * price
    ).run();
  }

  /* ===============================
     RESPONSE
     =============================== */
  return Response.json({
    success: true,
    vo_id,
    vo_no,
    created_by: user.username
  });
}
