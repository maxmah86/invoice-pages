export async function onRequestPost({ request, env }) {

  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const {
    quotation_id,
    invoice_id,
    title,
    reason,
    notes,
    items
  } = await request.json();

  if (!Array.isArray(items) || items.length === 0) {
    return new Response("Invalid data", { status: 400 });
  }

  let amount = 0;
  for (const i of items) {
    amount += Number(i.qty) * Number(i.unit_price);
  }

  const d = new Date();
  const date = d.toISOString().slice(0,10).replace(/-/g,"");

  const cnt = await env.DB.prepare(`
    SELECT COUNT(*) AS c
    FROM variation_orders
    WHERE date(created_at) = date('now')
  `).first();

  const vo_no = `VO-${date}-${String(cnt.c + 1).padStart(4,"0")}`;

  const r = await env.DB.prepare(`
    INSERT INTO variation_orders (
      vo_no,
      quotation_id,
      invoice_id,
      title,
      reason,
      amount,
      status,
      notes
    ) VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?)
  `).bind(
    vo_no,
    quotation_id || null,
    invoice_id || null,
    title || "",
    reason || "",
    amount,
    notes || ""
  ).run();

  const vo_id = r.meta.last_row_id;

  for (const i of items) {
    await env.DB.prepare(`
      INSERT INTO variation_order_items (
        variation_order_id,
        description,
        qty,
        unit_price,
        line_total
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(
      vo_id,
      i.description,
      Number(i.qty),
      Number(i.unit_price),
      Number(i.qty) * Number(i.unit_price)
    ).run();
  }

  return Response.json({
    success: true,
    vo_id,
    vo_no
  });
}
