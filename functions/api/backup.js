export async function onRequestGet({ request, env }) {

  /* ===== AUTH ===== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) return new Response("Unauthorized", { status: 401 });

  const user = await env.DB.prepare(`
    SELECT role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  /* ===== TABLES TO BACKUP ===== */
  const tables = [
    "users",
    "quotations",
    "quotation_items",
    "invoices",
    "invoice_items",
    "work_checklists",
    "work_checklist_items",
    "variation_orders",
    "variation_order_items",
    "purchase_orders",
    "purchase_order_items"
  ];

  let sql = "-- MMAC SYSTEM BACKUP\n";
  sql += `-- ${new Date().toISOString()}\n\n`;

  for (const table of tables) {
    const rows = await env.DB.prepare(`SELECT * FROM ${table}`).all();

    for (const row of rows.results) {
      const cols = Object.keys(row).join(",");
      const vals = Object.values(row)
        .map(v =>
          v === null ? "NULL" :
          `'${String(v).replace(/'/g, "''")}'`
        )
        .join(",");

      sql += `INSERT INTO ${table} (${cols}) VALUES (${vals});\n`;
    }

    sql += "\n";
  }

  return new Response(sql, {
    headers: {
      "Content-Type": "text/sql",
      "Content-Disposition": "attachment"
    }
  });
}
