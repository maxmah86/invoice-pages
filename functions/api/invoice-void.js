export async function onRequestPost({ request, env }) {

  /* ===============================
     AUTH CHECK (session_token)
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const user = await env.DB.prepare(`
    SELECT id, username, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     ROLE CHECK (ADMIN ONLY)
     =============================== */
  if (user.role !== "admin") {
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     PARSE BODY
     =============================== */
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { id, reason } = body;

  if (!id) {
    return new Response(
      JSON.stringify({ error: "Missing invoice id" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     VOID INVOICE
     =============================== */
  const r = await env.DB.prepare(`
    UPDATE invoices
    SET
      status = 'VOID',
      voided_at = datetime('now'),
      void_reason = ?
    WHERE id = ?
      AND status != 'VOID'
  `).bind(
    reason || "Voided",
    id
  ).run();

  if (r.meta.changes === 0) {
    return new Response(
      JSON.stringify({ error: "Invoice not found or already voided" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     RESPONSE
     =============================== */
  return new Response(
    JSON.stringify({
      success: true,
      voided_by: user.username,
      role: user.role
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
