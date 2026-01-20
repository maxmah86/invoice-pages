export async function onRequestPost({ request, env }) {

  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { vo_id } = await request.json();
  if (!vo_id) {
    return new Response("Invalid data", { status: 400 });
  }

  const vo = await env.DB.prepare(`
    SELECT *
    FROM variation_orders
    WHERE id = ?
  `).bind(vo_id).first();

  if (!vo || vo.status !== "APPROVED") {
    return new Response("VO not invoiceable", { status: 400 });
  }

  const items = await env.DB.prepare(`
    SELECT description, qty, unit_price, line_total
    FROM variation_order_items
    WHERE variation_order_id = ?
  `).bind(vo_id).all();

  let total = 0;
  for (const i of items.results) {
    total += Number(i.line_total);
  }

  const d = new Date();
  const date = d.toISOString().slice(0,10).replace(/-/g,"");

  const cnt = await env.DB.prepare(`
    SELECT COUNT(*) AS c
    FROM invoices
    WHERE date(created_at) = date('now')
  `).first();

  const invoice_no = `INV-${date}-${String(cnt.c + 1).padStart(4,"0")}`;

  const r = await env.DB.prepare(`
    INSERT INTO invoices (
      invoice_no,
      customer,
      amount,
      source_type,
      source_id
    ) VALUES (?, ?, ?, 'VO', ?)
  `).bind(
    invoice_no,
    vo.title || "Variation Order",
    total,
    vo_id
  ).run();

  const invoice_id = r.meta.last_row_id;

  for (const i of items.results) {
    await env.DB.prepare(`
      INSERT INTO invoice_items (
        invoice_id,
        description,
        qty,
        price
      ) VALUES (?, ?, ?, ?)
    `).bind(
      invoice_id,
      i.description,
      i.qty,
      i.unit_price
    ).run();
  }

  await env.DB.prepare(`
    UPDATE variation_orders
    SET status = 'INVOICED', invoice_id = ?
    WHERE id = ?
  `).bind(invoice_id, vo_id).run();

  return Response.json({
    success: true,
    invoice_id,
    invoice_no
  });
}
