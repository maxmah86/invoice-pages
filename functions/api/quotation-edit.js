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

  /* ===== ADMIN ONLY ===== */
  if (user.role !== "admin") {
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

  const { id, customer, items, terms_id } = body;

  if (!id || !customer || !Array.isArray(items) || items.length === 0) {
    return new Response("Invalid data", { status: 400 });
  }

  /* ===============================
     CHECK QUOTATION STATUS
     =============================== */
  const quotation = await env.DB.prepare(`
    SELECT status
    FROM quotations
    WHERE id = ?
  `).bind(id).first();

  if (!quotation || quotation.status !== "OPEN") {
    return new Response("Quotation not editable", { status: 400 });
  }

  /* ===============================
     CALCULATE TOTAL
     =============================== */
  const total = items.reduce(
    (sum, it) =>
      sum + (Number(it.qty) || 0) * (Number(it.price) || 0),
    0
  );

  /* ===============================
     LOAD TERMS SNAPSHOT
     =============================== */
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

  /* ===============================
     UPDATE QUOTATION
     =============================== */
  await env.DB.prepare(`
    UPDATE quotations
    SET
      customer = ?,
      amount = ?,
      terms_id = ?,
      terms_snapshot = ?,
      updated_at = datetime('now'),
      updated_by = ?
    WHERE id = ?
  `).bind(
    customer,
    total,
    terms_id || null,
    terms_snapshot,
    user.username,
    id
  ).run();

  /* ===============================
     REPLACE ITEMS
     =============================== */
  await env.DB.prepare(`
    DELETE FROM quotation_items
    WHERE quotation_id = ?
  `).bind(id).run();

  const stmt = env.DB.prepare(`
    INSERT INTO quotation_items (
      quotation_id,
      description,
      qty,
      price
    ) VALUES (?, ?, ?, ?)
  `);

  for (const it of items) {
    await stmt.bind(
      id,
      it.description || "",
      Number(it.qty) || 0,
      Number(it.price) || 0
    ).run();
  }

  /* ===============================
     RESPONSE
     =============================== */
  return Response.json({
    success: true,
    updated_by: user.username
  });
}
