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
    id,
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

  if (!id)          return Response.json({ error: "Missing id" }, { status: 400 });
  if (!expense_date || !description) {
    return Response.json({ error: "expense_date and description are required" }, { status: 400 });
  }

  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) {
    return Response.json({ error: "Invalid amount" }, { status: 400 });
  }

  try {
    const r = await env.DB.prepare(`
      UPDATE expenses SET
        expense_date   = ?,
        category       = ?,
        description    = ?,
        vendor         = ?,
        receipt_no     = ?,
        amount         = ?,
        payment_method = ?,
        paid_by        = ?,
        project_id     = ?,
        notes          = ?,
        status         = ?
      WHERE id = ?
    `).bind(
      expense_date,
      category       || "Others",
      description.trim(),
      vendor         || null,
      receipt_no     || null,
      amt,
      payment_method || "CASH",
      paid_by        || null,
      project_id     || null,
      notes          || null,
      status         || "PAID",
      id
    ).run();

    if (r.meta.changes === 0) {
      return Response.json({ error: "Expense not found" }, { status: 404 });
    }

    return Response.json({ success: true, id });

  } catch (err) {
    return Response.json({ error: "Database error: " + err.message }, { status: 500 });
  }
}
