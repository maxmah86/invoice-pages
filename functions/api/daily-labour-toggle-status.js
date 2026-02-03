export async function onRequestPost({ request, env }) {

  /* ===== AUTH (session_token) ===== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = await env.DB.prepare(`
    SELECT username
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  /* ===== PARSE BODY ===== */
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { id, status } = body;

  if (!id || !["PAID", "UNPAID"].includes(status)) {
    return new Response("Invalid data", { status: 400 });
  }

  /* ===== UPDATE ===== */
  await env.DB.prepare(`
    UPDATE daily_labours
    SET
      status = ?,
      paid_at = CASE WHEN ? = 'PAID' THEN datetime('now') ELSE NULL END,
      paid_by = CASE WHEN ? = 'PAID' THEN ? ELSE NULL END
    WHERE id = ?
  `).bind(
    status,
    status,
    status,
    user.username,
    id
  ).run();

  return new Response(
    JSON.stringify({ success: true, status }),
    { headers: { "Content-Type": "application/json" } }
  );
}
