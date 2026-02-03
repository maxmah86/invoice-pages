export async function onRequestPost({ request, env }) {

  /* ===============================
     AUTH CHECK (session_token)
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  const user = await env.DB.prepare(`
    SELECT username, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
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
      { status: 400 }
    );
  }

  const { id, void_reason } = body || {};

  if (!id || !void_reason) {
    return new Response(
      JSON.stringify({ error: "Missing id or void_reason" }),
      { status: 400 }
    );
  }

  /* ===============================
     LOAD DAILY LABOUR
     =============================== */
  const row = await env.DB.prepare(`
    SELECT status
    FROM daily_labours
    WHERE id = ?
  `).bind(id).first();

  if (!row) {
    return new Response(
      JSON.stringify({ error: "Daily labour not found" }),
      { status: 404 }
    );
  }

  if (row.status !== "UNPAID") {
    return new Response(
      JSON.stringify({
        error: "Only UNPAID payslip can be voided",
        current_status: row.status
      }),
      { status: 400 }
    );
  }

  /* ===============================
     VOID PAYSLIP
     =============================== */
  await env.DB.prepare(`
    UPDATE daily_labours
    SET
      status = 'VOID',
      void_reason = ?
    WHERE id = ?
  `).bind(
    void_reason,
    id
  ).run();

  /* ===============================
     RESPONSE
     =============================== */
  return new Response(
    JSON.stringify({
      success: true,
      id,
      status: "VOID",
      voided_by: user.username
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
