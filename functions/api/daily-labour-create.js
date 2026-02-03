export async function onRequestPost({ request, env }) {

  /* ===== AUTH ===== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await env.DB.prepare(`
    SELECT username
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  /* ===== BODY ===== */
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    labour_date,
    worker_name,
    job,
    amount,
    status,
    payment_method,
    paid_by,
    notes
  } = body;

  if (!labour_date || !worker_name || amount == null) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) {
    return Response.json({ error: "Invalid amount" }, { status: 400 });
  }

  const finalStatus = status === "PAID" ? "PAID" : "UNPAID";
  const paidAt = finalStatus === "PAID" ? "datetime('now')" : null;

  /* ===== SLIP NO ===== */
  const dateStr = labour_date.replace(/-/g, "");
  const cnt = await env.DB.prepare(`
    SELECT COUNT(*) AS c
    FROM daily_labours
    WHERE labour_date = ?
  `).bind(labour_date).first();

  const slip_no = `DL-${dateStr}-${String(cnt.c + 1).padStart(4, "0")}`;

  /* ===== INSERT ===== */
  const sql = `
    INSERT INTO daily_labours (
      slip_no,
      labour_date,
      worker_name,
      job,
      amount,
      payment_method,
      paid_by,
      paid_at,
      notes,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ${paidAt ? "datetime('now')" : "NULL"}, ?, ?)
  `;

  const r = await env.DB.prepare(sql).bind(
    slip_no,
    labour_date,
    worker_name,
    job || "",
    amt,
    payment_method || "",
    paid_by || "",
    notes || "",
    finalStatus
  ).run();

  return Response.json({
    success: true,
    id: r.meta.last_row_id,
    slip_no
  });
}
