export async function onRequestPost({ request, env }) {

  /* ===============================
     AUTH CHECK
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let user;
  try {
    user = await env.DB.prepare(`
      SELECT id, username, role FROM users WHERE session_token = ?
    `).bind(token).first();
  } catch (err) {
    return Response.json({ error: "DB error: " + err.message }, { status: 500 });
  }

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!["admin", "staff"].includes(user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  /* ===============================
     PARSE BODY
     =============================== */
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    quotation_id,
    invoice_id,
    project_id,
    title,
    reason,
    notes,
    items
  } = body;

  /* ===============================
     VALIDATION
     =============================== */
  if (!title || !title.trim()) {
    return Response.json({ error: "Title is required" }, { status: 400 });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return Response.json({ error: "At least one item is required" }, { status: 400 });
  }

  if (!quotation_id && !invoice_id && !project_id) {
    return Response.json({ error: "VO must link to a project, quotation or invoice" }, { status: 400 });
  }

  /* ===============================
     CALCULATE AMOUNT
     =============================== */
  let amount = 0;
  for (const i of items) {
    amount += (Number(i.qty) || 0) * (Number(i.unit_price) || 0);
  }

  if (amount <= 0) {
    return Response.json({ error: "Total amount must be greater than 0" }, { status: 400 });
  }

  /* ===============================
     DB OPERATIONS — wrapped in try-catch
     so any DB error returns JSON, not HTML
     =============================== */
  try {

    /* Generate VO No using MAX (no duplicate risk) */
    const d = new Date();
    const date = d.toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `VO-${date}-`;

    const maxRow = await env.DB.prepare(`
      SELECT MAX(vo_no) AS max_no
      FROM variation_orders
      WHERE vo_no LIKE ?
    `).bind(prefix + "%").first();

    let seq = 1;
    if (maxRow?.max_no) {
      const lastSeq = parseInt(maxRow.max_no.slice(-4), 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }

    const vo_no = `${prefix}${String(seq).padStart(4, "0")}`;

    /* Insert VO header */
    const r = await env.DB.prepare(`
      INSERT INTO variation_orders (
        vo_no,
        quotation_id,
        invoice_id,
        project_id,
        title,
        reason,
        amount,
        status,
        notes,
        created_at,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, datetime('now'), ?)
    `).bind(
      vo_no,
      quotation_id || null,
      invoice_id   || null,
      project_id   || null,
      title.trim(),
      reason || "",
      amount,
      notes  || "",
      user.username
    ).run();

    const vo_id = r.meta.last_row_id;

    /* Insert VO items */
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
      const qty   = Number(i.qty)        || 0;
      const price = Number(i.unit_price) || 0;
      await stmt.bind(vo_id, i.description || "", qty, price, qty * price).run();
    }

    return Response.json({
      success: true,
      vo_id,
      vo_no,
      created_by: user.username
    });

  } catch (err) {
    /* Return the REAL error as JSON so we can debug it */
    return Response.json({
      error: "Database error: " + err.message
    }, { status: 500 });
  }
}
