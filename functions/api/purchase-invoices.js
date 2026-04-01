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

  const url = new URL(request.url);
  const projectId = url.searchParams.get("project_id");

  const baseSql = `
    SELECT
      id,
      pi_no,
      project_id,
      subcon_name,
      claim_date,
      net_amount,
      status,
      created_at
    FROM purchase_invoices
  `;

  const result = projectId
    ? await env.DB.prepare(baseSql + ` WHERE project_id = ? ORDER BY id DESC LIMIT 200`).bind(projectId).all()
    : await env.DB.prepare(baseSql + ` ORDER BY id DESC LIMIT 200`).all();

  return new Response(JSON.stringify(result.results || []), {
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
}
