export async function onRequestPost({ request, env }) {

  /* ===== AUTH ===== */
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response("Unauthorized", { status: 401 });
  }

  /* ===== BODY ===== */
  const { customer, items, terms_id } = await request.json();

  if (!customer || !Array.isArray(items) || items.length === 0) {
    return new Response("Invalid data", { status: 400 });
  }

  /* ===== CALCULATE TOTAL ===== */
  const total = items.reduce(
    (sum, i) => sum + Number(i.qty) * Number(i.price),
    0
  );

  /* ===== GENERATE QUOTATION NO ===== */
  const d = new Date();
  const date = d.toISOString().slice(0, 10).replace(/-/g, "");

  const cnt = await env.DB.prepare(`
    SELECT COUNT(*) AS c
    FROM quotations
    WHERE date(created_at) = date('now')
  `).first();

  const quotation_no = `QT-${date}-${String(cnt.c + 1).padStart(4, "0")}`;

  /* ===== LOAD TERMS SNAPSHOT ===== */
  let terms_snapshot = "";

  if (terms_id) {
    const term = await env.DB.prepare(`
      SELECT content
      FROM quotation_terms
      WHERE id = ? AND is_active = 1
    `).bind(terms_id).first();

    if (term) {
      terms_snapshot = term.content;
    }
  }

  /* ===== INSERT QUOTATION ===== */
  const q = await env.DB.prepare(`
    INSERT INTO quotations (
      quotation_no,
      customer,
      amount,
      terms_id,
      terms_snapshot
    ) VALUES (?, ?, ?, ?, ?)
  `).bind(
    quotation_no,
    customer,
    total,
    terms_id || null,
    terms_snapshot
  ).run();

  const quotation_id = q.meta.last_row_id;

  /* ===== INSERT ITEMS ===== */
  for (const it of items) {
    await env.DB.prepare(`
      INSERT INTO quotation_items (
        quotation_id,
        description,
        qty,
        price
      ) VALUES (?, ?, ?, ?)
    `).bind(
      quotation_id,
      it.description,
      Number(it.qty),
      Number(it.price)
    ).run();
  }

  /* ===== RESPONSE ===== */
  return Response.json({
    success: true,
    quotation_id,
    quotation_no
  });
}
