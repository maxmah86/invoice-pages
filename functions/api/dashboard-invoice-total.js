export async function onRequestGet({ request, env }) {
  try {
    const auth = await fetch(new URL("/api/auth-check", request.url), {
      headers: { cookie: request.headers.get("cookie") || "" }
    });
    if (!auth.ok) {
      return new Response("Unauthorized", { status: 401 });
    }

    /* ===============================
       STEP 1: 确认表是否存在
       =============================== */
    const tableCheck = await env.DB.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='invoices'
    `).first();

    if (!tableCheck) {
      return new Response(
        JSON.stringify({ total: 0, error: "invoices table not found" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    /* ===============================
       STEP 2: 安全 SUM（不加月份）
       =============================== */
    const row = await env.DB.prepare(`
      SELECT IFNULL(SUM(total), 0) AS total
      FROM invoices
    `).first();

    return new Response(
      JSON.stringify({ total: row.total }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    /* ===============================
       FAIL SAFE
       =============================== */
    return new Response(
      JSON.stringify({
        total: 0,
        error: "invoice dashboard error",
        detail: String(err)
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
}
