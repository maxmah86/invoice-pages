export async function onRequestGet({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) return new Response("Unauthorized", { status: 401 });

  const user = await env.DB.prepare(`
    SELECT id, username, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) return new Response("Unauthorized", { status: 401 });

  await ensureTables(env);

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return new Response("Missing id", { status: 400 });

  const header = await env.DB.prepare(`
    SELECT
      pi.*,
      p.project_name
    FROM purchase_invoices pi
    LEFT JOIN projects p ON p.id = pi.project_id
    WHERE pi.id = ?
  `).bind(id).first();

  if (!header) {
    return new Response(JSON.stringify({ error: "Purchase invoice not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }

  const items = await env.DB.prepare(`
    SELECT id, cost_type, description, qty, unit, unit_price, line_total
    FROM purchase_invoice_items
    WHERE purchase_invoice_id = ?
    ORDER BY id ASC
  `).bind(id).all();

  return new Response(JSON.stringify({
    viewer: {
      id: user.id,
      username: user.username,
      role: user.role
    },
    header,
    items: items.results || []
  }), {
    headers: { "Content-Type": "application/json" }
  });
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
