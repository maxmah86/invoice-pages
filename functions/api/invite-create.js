function randomCode(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export async function onRequestPost({ request, env }) {

  /* ===== AUTH (admin only) ===== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];
  if (!token) return new Response("Unauthorized", { status: 401 });

  const user = await env.DB.prepare(`
    SELECT role FROM users WHERE session_token = ?
  `).bind(token).first();

  if (!user || user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  /* ===== BODY ===== */
  const { role = "user", days = 7 } = await request.json();

  const code = randomCode(12);
  const expires_at = days
    ? `datetime('now', '+${days} days')`
    : null;

  await env.DB.prepare(`
    INSERT INTO invite_codes (code, role, expires_at)
    VALUES (?, ?, ${expires_at || "NULL"})
  `).bind(code, role).run();

  return Response.json({
    success: true,
    code,
    role,
    expires_in_days: days
  });
}
