export async function onRequest({ request, env }) {

  /* ===== AUTH ===== */
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response("Unauthorized", { status: 401 });
  }

  /* ===== BODY ===== */
  const body = await request.json();
  const {
    id,
    customer,
    items,
    terms_id   // ⭐ 新增
  } = body;

  if (!id || !customer || !items?.length) {
    return new Response("Invalid data", { status: 400 });
  }

  /* ===== CHECK STATUS ===== */
  const quotation = await env.DB.prepare(
    "SELECT status FROM quotations WHERE id = ?"
  ).bind(id).first();

  if (!quotation || quotation.status !== "OPEN") {
    return new Response("Quotation not editable", { status: 400 });
  }

  /* ===== CALCULATE TOTAL ===== */
  const amount = items.reduce(
    (s, i) => s + Number(i.qty) * Number(i.price),
    0
  );

  /* ===== LOAD TERMS CONTENT (锁定文本) ===== */
  let termsContent = null;

  if (terms_id) {
    const term = await env.DB.prepare(`
      SELECT content
      FROM quotation_terms
      WHERE id = ? AND is_active = 1
    `).bind(terms_id).first();

    if (!term) {
      return new Response("Invalid terms", { status: 400 });
    }

    termsContent = term.content;
  }

  /* ===== UPDATE QUOTATION ===== */
  await env.DB.prepare(`
    UPDATE quotations
    SET
      customer = ?,
      amount = ?,
      terms_id = ?,
      terms_content = ?
    WHERE id = ?
  `).bind(
    customer,
    amount,
    terms_id || null,
    termsContent,
    id
  ).run();

  /* ===== CLEAR OLD ITEMS ===== */
  await env.DB.prepare(
    "DELETE FROM quotation_items WHERE quotation_id = ?"
  ).bind(id).run();

  /* ===== INSERT NEW ITEMS ===== */
  for (const i of items) {
    await env.DB.prepare(`
      INSERT INTO quotation_items
      (quotation_id, description, qty, price)
      VALUES (?, ?, ?, ?)
    `).bind(
      id,
      i.description,
      Number(i.qty),
      Number(i.price)
    ).run();
  }

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { "Content-Type": "application/json" } }
  );
}
