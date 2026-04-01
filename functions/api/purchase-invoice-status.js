export async function onRequestPost({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) return new Response("Unauthorized", { status: 401 });

  const user = await env.DB.prepare(`
    SELECT id, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) return new Response("Unauthorized", { status: 401 });
  if (user.role !== "admin") return new Response("Forbidden", { status: 403 });

  await ensureTables(env);

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const { id, status } = body || {};
  const allowed = ["DRAFT", "APPROVED", "PARTIAL", "PAID", "REJECTED"];

  if (!id || !allowed.includes(status)) {
    return new Response(JSON.stringify({ error: "Invalid data" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const r = await env.DB.prepare(`
    UPDATE purchase_invoices
    SET status = ?
    WHERE id = ?
  `).bind(status, id).run();

  if (r.meta.changes === 0) {
    return new Response(JSON.stringify({ error: "Purchase invoice not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ success: true, status }), {
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
