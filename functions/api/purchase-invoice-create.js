export async function onRequestPost({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const user = await env.DB.prepare(`
    SELECT id, username, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user || user.role !== "admin") {
    return new Response(JSON.stringify({ error: user ? "Forbidden" : "Unauthorized" }), {
      status: user ? 403 : 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  await ensureTables(env);

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const {
    project_id,
    subcon_name,
    claim_date,
    period_from,
    period_to,
    retention_pct,
    less_advance,
    notes,
    items
  } = body || {};

  if (!subcon_name || !Array.isArray(items) || items.length === 0) {
    return new Response(JSON.stringify({ error: "subcon_name and items are required" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const targetDate = claim_date && /^\d{4}-\d{2}-\d{2}$/.test(claim_date)
    ? claim_date
    : new Date().toISOString().slice(0, 10);

  const dateStr = targetDate.replace(/-/g, "");
  const prefix = `PINV-${dateStr}-`;

  const maxRow = await env.DB.prepare(`
    SELECT MAX(pi_no) AS max_no
    FROM purchase_invoices
    WHERE pi_no LIKE ?
  `).bind(prefix + "%").first();

  let seq = 1;
  if (maxRow?.max_no) {
    const last = parseInt(maxRow.max_no.slice(-4), 10);
    if (!Number.isNaN(last)) seq = last + 1;
  }
  const piNo = `${prefix}${String(seq).padStart(4, "0")}`;

  let labourAmount = 0;
  let materialAmount = 0;
  let otherAmount = 0;

  for (const it of items) {
    const qty = Number(it.qty) || 0;
    const unitPrice = Number(it.unit_price ?? it.price) || 0;
    const lineTotal = qty * unitPrice;
    const type = String(it.cost_type || "OTHER").toUpperCase();

    if (type === "LABOUR") labourAmount += lineTotal;
    else if (type === "MATERIAL") materialAmount += lineTotal;
    else otherAmount += lineTotal;
  }

  const grossAmount = labourAmount + materialAmount + otherAmount;
  const safeRetentionPct = Number(retention_pct) || 0;
  const retentionAmount = grossAmount * (safeRetentionPct / 100);
  const safeLessAdvance = Number(less_advance) || 0;
  const netAmount = grossAmount - retentionAmount - safeLessAdvance;

  const createdAt = targetDate + " 00:00:00";

  try {
    const header = await env.DB.prepare(`
      INSERT INTO purchase_invoices (
        pi_no,
        project_id,
        subcon_name,
        claim_date,
        period_from,
        period_to,
        labour_amount,
        material_amount,
        other_amount,
        gross_amount,
        retention_pct,
        retention_amount,
        less_advance,
        net_amount,
        status,
        notes,
        created_by,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)
    `).bind(
      piNo,
      project_id || null,
      subcon_name,
      targetDate,
      period_from || null,
      period_to || null,
      labourAmount,
      materialAmount,
      otherAmount,
      grossAmount,
      safeRetentionPct,
      retentionAmount,
      safeLessAdvance,
      netAmount,
      notes || "",
      user.username,
      createdAt
    ).run();

    const purchaseInvoiceId = header.meta.last_row_id;

    for (const it of items) {
      const qty = Number(it.qty) || 0;
      const unitPrice = Number(it.unit_price ?? it.price) || 0;
      const lineTotal = qty * unitPrice;
      const type = String(it.cost_type || "OTHER").toUpperCase();

      await env.DB.prepare(`
        INSERT INTO purchase_invoice_items (
          purchase_invoice_id,
          cost_type,
          description,
          qty,
          unit,
          unit_price,
          line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        purchaseInvoiceId,
        ["LABOUR", "MATERIAL", "OTHER"].includes(type) ? type : "OTHER",
        it.description || "",
        qty,
        it.unit || "",
        unitPrice,
        lineTotal
      ).run();
    }

    return new Response(JSON.stringify({ success: true, id: purchaseInvoiceId, pi_no: piNo }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Database error: " + err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

async function ensureTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS purchase_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pi_no TEXT UNIQUE NOT NULL,
      project_id INTEGER,
      subcon_name TEXT NOT NULL,
      claim_date TEXT NOT NULL,
      period_from TEXT,
      period_to TEXT,
      labour_amount REAL NOT NULL DEFAULT 0,
      material_amount REAL NOT NULL DEFAULT 0,
      other_amount REAL NOT NULL DEFAULT 0,
      gross_amount REAL NOT NULL DEFAULT 0,
      retention_pct REAL NOT NULL DEFAULT 0,
      retention_amount REAL NOT NULL DEFAULT 0,
      less_advance REAL NOT NULL DEFAULT 0,
      net_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS purchase_invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_invoice_id INTEGER NOT NULL,
      cost_type TEXT NOT NULL DEFAULT 'OTHER',
      description TEXT,
      qty REAL NOT NULL DEFAULT 0,
      unit TEXT,
      unit_price REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE CASCADE
    )
  `).run();
}
