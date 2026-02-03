export async function onRequestPost({ request, env }) {

  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = await env.DB.prepare(`
    SELECT username, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

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

  await env.DB.prepare(`
    UPDATE daily_labours
    SET
      status = ?,
      paid_at = CASE
        WHEN ? = 'PAID' THEN datetime('now')
        ELSE NULL
      END
    WHERE id = ?
  `).bind(
    status,
    status,
    id
  ).run();

  return Response.json({
    success: true,
    status
  });
}
