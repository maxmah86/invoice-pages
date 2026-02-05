export async function onRequestPost({ request, env }) {
  const db = env.DB;

  /* ===============================
   * Admin auth（跟你现有风格）
   * =============================== */
  const authRes = await fetch(new URL("/api/auth-check", request.url), {
    headers: {
      Cookie: request.headers.get("Cookie") || ""
    }
  });

  const auth = await authRes.json();

  if (!auth.loggedIn) {
    return jsonError("Not logged in", 401);
  }

  if (auth.role !== "admin") {
    return jsonError("Permission denied", 403);
  }

  /* ===============================
   * Request body
   * =============================== */
  const { quotation_id } = await request.json();

  if (!quotation_id) {
    return jsonError("quotation_id required");
  }

  /* ===============================
   * 1️⃣ Check quotation status
   * =============================== */
  const q = await db.prepare(`
    SELECT *
    FROM quotations
    WHERE id = ?
      AND status = 'ACCEPTED'
  `).bind(quotation_id).first();

  if (!q) {
    return jsonError("Quotation not accepted or not found");
  }

  /* ===============================
   * 2️⃣ Create invoice
   * =============================== */
  await db.prepare(`
    INSERT INTO invoices (
      customer,
      amount,
      status,
      invoice_no,
      created_at,
      quotation_id
    )
    VALUES (
      ?, ?,
      'UNPAID',
      'INV' || strftime('%Y%m%d%H%M%S','now'),
      datetime('now'),
      ?
    )
  `).bind(
    q.customer,
    q.grand_total,
    quotation_id
  ).run();

  const invoiceId =
    (await db.prepare(`SELECT last_insert_rowid() AS id`).first()).id;

  /* ===============================
   * 3️⃣ Copy quotation items
   * =============================== */
  await db.prepare(`
    INSERT INTO invoice_items (
      invoice_id,
      description,
      qty,
      price
    )
    SELECT
      ?,
      description,
      qty,
      unit_price
    FROM quotation_items
    WHERE quotation_id = ?
      AND is_priced = 1
  `).bind(
    invoiceId,
    quotation_id
  ).run();

  /* ===============================
   * Done
   * =============================== */
  return jsonOK({
    invoice_id: invoiceId
  });
}

/* ===============================
 * Helpers（如果你这个文件还没）
 * =============================== */
function jsonOK(data) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { "Content-Type": "application/json" }
  });
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
