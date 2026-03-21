export async function onRequestPost({ request, env }) {

  /* ── Auth ── */
  const cookie = request.headers.get("Cookie") || "";
  const token  = cookie.match(/session=([^;]+)/)?.[1];
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let user;
  try {
    user = await env.DB.prepare(
      `SELECT id, username, role FROM users WHERE session_token = ?`
    ).bind(token).first();
  } catch (err) {
    return Response.json({ error: "DB error: " + err.message }, { status: 500 });
  }

  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

  /* ── Parse body ── */
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const {
    expense_date,
    category,
    description,
    vendor,
    receipt_no,
    amount,
    payment_method,
    paid_by,
    project_id,
    notes,
    status
  } = body;

  if (!expense_date || !description || amount == null) {
    return Response.json({ error: "expense_date, description and amount are required" }, { status: 400 });
  }

  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) {
    return Response.json({ error: "Invalid amount" }, { status: 400 });
  }

  /* ── DB ── */
  try {
    /* Generate expense_no using MAX */
    const dateStr = expense_date.replace(/-/g, "");
    const prefix  = `EXP-${dateStr}-`;

    const maxRow = await env.DB.prepare(`
      SELECT MAX(expense_no) AS max_no FROM expenses WHERE expense_no LIKE ?
    `).bind(prefix + "%").first();

    let seq = 1;
    if (maxRow?.max_no) {
      const last = parseInt(maxRow.max_no.slice(-4), 10);
      if (!isNaN(last)) seq = last + 1;
    }
    const expense_no = `${prefix}${String(seq).padStart(4, "0")}`;

    const r = await env.DB.prepare(`
      INSERT INTO expenses (
        expense_no, expense_date, category, description,
        vendor, receipt_no, amount, payment_method,
        paid_by, project_id, notes, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      expense_no,
      expense_date,
      category      || "Others",
      description.trim(),
      vendor        || null,
      receipt_no    || null,
      amt,
      payment_method || "CASH",
      paid_by       || null,
      project_id    || null,
      notes         || null,
      status        || "PAID"
    ).run();

    return Response.json({ success: true, id: r.meta.last_row_id, expense_no });

  } catch (err) {
    return Response.json({ error: "Database error: " + err.message }, { status: 500 });
  }
}
