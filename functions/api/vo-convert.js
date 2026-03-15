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

  if (!user || user.role !== "admin") {
    return Response.json({ error: user ? "Forbidden" : "Unauthorized" }, { status: user ? 403 : 401 });
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

  const { vo_id } = body;
  if (!vo_id) {
    return Response.json({ error: "Missing vo_id" }, { status: 400 });
  }

  /* ===============================
     ALL DB OPERATIONS
     =============================== */
  try {

    /* Load VO */
    const vo = await env.DB.prepare(`
      SELECT id, quotation_id, invoice_id, title, status, project_id
      FROM variation_orders
      WHERE id = ?
    `).bind(vo_id).first();

    if (!vo) {
      return Response.json({ error: "VO not found" }, { status: 404 });
    }

    if (vo.status !== "APPROVED") {
      return Response.json({ error: "VO must be APPROVED before converting to invoice" }, { status: 400 });
    }

    /* Prevent duplicate — check if VO already has an invoice_id set to INVOICED */
    if (vo.invoice_id) {
      const dupCheck = await env.DB.prepare(`
        SELECT id, invoice_no FROM invoices WHERE id = ?
      `).bind(vo.invoice_id).first();
      if (dupCheck) {
        return Response.json({ error: "VO already invoiced as " + dupCheck.invoice_no }, { status: 400 });
      }
    }

    /* Load VO items */
    const items = await env.DB.prepare(`
      SELECT description, qty, unit_price
      FROM variation_order_items
      WHERE variation_order_id = ?
    `).bind(vo_id).all();

    if (!items.results.length) {
      return Response.json({ error: "VO has no items" }, { status: 400 });
    }

    /* Get customer name: project → quotation → invoice → fallback */
    let customerName = "VO Customer";

    if (vo.project_id) {
      const proj = await env.DB.prepare(
        `SELECT client_name FROM projects WHERE id = ?`
      ).bind(vo.project_id).first();
      if (proj?.client_name) customerName = proj.client_name;
    }

    if (customerName === "VO Customer" && vo.quotation_id) {
      const quot = await env.DB.prepare(
        `SELECT customer FROM quotations WHERE id = ?`
      ).bind(vo.quotation_id).first();
      if (quot?.customer) customerName = quot.customer;
    }

    if (customerName === "VO Customer" && vo.invoice_id) {
      const linkedInv = await env.DB.prepare(
        `SELECT customer FROM invoices WHERE id = ?`
      ).bind(vo.invoice_id).first();
      if (linkedInv?.customer) customerName = linkedInv.customer;
    }

    /* Calculate total */
    let total = 0;
    for (const it of items.results) {
      total += Number(it.qty) * Number(it.unit_price);
    }

    /* Generate invoice no using MAX */
    const d = new Date();
    const date = d.toISOString().slice(0, 10).replace(/-/g, "");
    const invPrefix = `INV-${date}-`;

    const maxInv = await env.DB.prepare(`
      SELECT MAX(invoice_no) AS max_no FROM invoices WHERE invoice_no LIKE ?
    `).bind(invPrefix + "%").first();

    let invSeq = 1;
    if (maxInv?.max_no) {
      const last = parseInt(maxInv.max_no.slice(-4), 10);
      if (!isNaN(last)) invSeq = last + 1;
    }

    const invoice_no = `${invPrefix}${String(invSeq).padStart(4, "0")}`;

    /* Insert invoice — only columns that exist in DB */
    const inv = await env.DB.prepare(`
      INSERT INTO invoices (
        invoice_no,
        customer,
        amount,
        status,
        project_id,
        quotation_id,
        created_at
      ) VALUES (?, ?, ?, 'UNPAID', ?, ?, datetime('now'))
    `).bind(
      invoice_no,
      customerName,
      total,
      vo.project_id   || null,
      vo.quotation_id || null
    ).run();

    const invoice_id = inv.meta.last_row_id;

    /* Insert invoice items */
    const stmt = env.DB.prepare(`
      INSERT INTO invoice_items (invoice_id, description, qty, price)
      VALUES (?, ?, ?, ?)
    `);

    for (const it of items.results) {
      await stmt.bind(invoice_id, it.description, it.qty, it.unit_price).run();
    }

    /* Update VO status to INVOICED */
    await env.DB.prepare(`
      UPDATE variation_orders
      SET status = 'INVOICED', invoice_id = ?
      WHERE id = ?
    `).bind(invoice_id, vo_id).run();

    return Response.json({
      success: true,
      invoice_id,
      invoice_no,
      converted_by: user.username
    });

  } catch (err) {
    return Response.json({
      error: "Database error: " + err.message
    }, { status: 500 });
  }
}
