export async function onRequestPost({ request, env }) {

  /* ===============================
     AUTH (session_token + role)
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  const user = await env.DB.prepare(`
    SELECT id, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  if (user.role !== "admin") {
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403 }
    );
  }

  /* ===============================
     PARSE BODY
     =============================== */
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400 }
    );
  }

  const { id, customer, items, sections } = body || {};

  const hasSections = Array.isArray(sections);
  const hasItems = Array.isArray(items);

  if (!id || !customer || (!hasSections && !hasItems)) {
    return new Response(
      JSON.stringify({ error: "Invalid data" }),
      { status: 400 }
    );
  }

  /* ===============================
     CHECK INVOICE STATUS
     =============================== */
  const invoice = await env.DB.prepare(`
    SELECT status
    FROM invoices
    WHERE id = ?
  `).bind(id).first();

  if (!invoice || invoice.status !== "UNPAID") {
    return new Response(
      JSON.stringify({ error: "Invoice cannot be edited" }),
      { status: 400 }
    );
  }

  /* ===============================
     RE-CALCULATE TOTAL
     =============================== */
  const normalizedSections = hasSections
    ? sections
        .map((sec, secIdx) => ({
          section_title: String(sec.title || sec.section_title || "").trim() || `Section ${secIdx + 1}`,
          sort_order: Number(sec.sort_order) || secIdx,
          items: (Array.isArray(sec.items) ? sec.items : [])
            .map((it, idx) => ({
              description: String(it.description || "").trim(),
              UOM: String(it.UOM || "LOT").trim() || "LOT",
              qty: Number(it.qty) || 0,
              price: Number(it.price) || 0,
              sort_order: Number(it.sort_order) || idx
            }))
            .filter((it) => it.description && it.qty > 0 && it.price >= 0)
        }))
        .filter((sec) => sec.items.length > 0)
    : [
        {
          section_title: "Items",
          sort_order: 0,
          items: items
            .map((it, idx) => ({
              description: String(it.description || "").trim(),
              UOM: String(it.UOM || "LOT").trim() || "LOT",
              qty: Number(it.qty) || 0,
              price: Number(it.price) || 0,
              sort_order: idx
            }))
            .filter((it) => it.description && it.qty > 0 && it.price >= 0)
        }
      ].filter((sec) => sec.items.length > 0);

  if (normalizedSections.length === 0) {
    return new Response(
      JSON.stringify({ error: "At least one valid item is required" }),
      { status: 400 }
    );
  }

  let total = 0;
  for (const sec of normalizedSections) {
    for (const it of sec.items) {
      total += it.qty * it.price;
    }
  }

  /* ===============================
     UPDATE INVOICE
     =============================== */
  await env.DB.prepare(`
    UPDATE invoices
    SET customer = ?, amount = ?
    WHERE id = ?
  `).bind(customer, total, id).run();

  /* ===============================
     REPLACE ITEMS
     =============================== */
  await env.DB.prepare(`
    DELETE FROM invoice_items
    WHERE invoice_id = ?
  `).bind(id).run();

  await env.DB.prepare(`
    DELETE FROM invoice_sections
    WHERE invoice_id = ?
  `).bind(id).run();

  for (const sec of normalizedSections) {
    const secRow = await env.DB.prepare(`
      INSERT INTO invoice_sections
        (invoice_id, section_title, sort_order)
      VALUES (?, ?, ?)
    `).bind(id, sec.section_title, sec.sort_order).run();

    const secId = secRow.meta.last_row_id;
    const itemInserts = sec.items.map((it) =>
      env.DB.prepare(`
        INSERT INTO invoice_items
          (invoice_id, section_id, description, UOM, qty, price, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        secId,
        it.description,
        it.UOM,
        it.qty,
        it.price,
        it.sort_order
      )
    );

    if (itemInserts.length > 0) {
      await env.DB.batch(itemInserts);
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      updated_by: user.id,
      role: user.role
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}