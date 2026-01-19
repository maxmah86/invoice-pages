export async function onRequestPost({ request, env }) {

  /* ===== AUTH ===== */
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response("Unauthorized", { status: 401 });
  }

  /* ===== BODY ===== */
  const {
    id,
    customer,
    items,
    terms_id
  } = await request.json();

  if (!id || !customer || !Array.isArray(items) || items.length === 0) {
    return new Response("Invalid data", { status: 400 });
  }

  /* ===== CHECK STATUS ===== */
  const quotation = await env.DB.prepare(`
    SELECT status
    FROM quotations
    WHERE id = ?
  `).bind(id).first();

  if (!quotation || quotation.status !== "OPEN") {
    return new Response("Quotation not editable", { status: 400 });
  }

  /* ===== CALCULATE TOTAL ===== */
  const total = items.reduce(
    (sum, i) => sum + Number(i.qty) * Number(i.price),
    0
  );

  /* ===== LOAD TERMS SNAPSHOT ===== */
  let terms_snapshot = "";

  if (terms_id) {
    const term = await env.DB.prepare(`
      SELECT content
      FROM quotation_terms
      WHERE id = ? AND is_active = 1
    `).bind(terms_id).first();

    if (!term) {
      return new Response("Invalid terms", { status: 400 });
    }

    terms_snapshot = term.content;
  }

  /* ===== UPDATE QUOTATION ===== */
  await env.DB.prepare(`
    UPDATE quotations
    SET
      customer = ?,
      amount = ?,
      terms_id = ?,
      terms_snapshot = ?
    WHERE id = ?
  `).bind(
    customer,
    total,
    terms_id || null,
    terms_snapshot,
    id
  ).run();

  /* ===== REPLACE ITEMS ===== */
  await env.DB.prepare(`
    DELETE FROM quotation_items
    WHERE quotation_id = ?
  `).bind(id).run();

  for (const it of items) {
    await env.DB.prepare(`
      INSERT INTO quotation_items (
        quotation_id,
        description,
        qty,
        price
      ) VALUES (?, ?, ?, ?)
    `).bind(
      id,
      it.description,
      Number(it.qty),
      Number(it.price)
    ).run();
  }

  /* ===== RESPONSE ===== */
  return Response.json({ success: true });
}
