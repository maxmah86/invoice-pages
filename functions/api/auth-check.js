export async function onRequest({ request, env }) {

  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return Response.json({ loggedIn: false });
  }

  const user = await env.DB.prepare(`
    SELECT username, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return Response.json({ loggedIn: false });
  }

  return Response.json({
    loggedIn: true,
    username: user.username,
    role: user.role
  });
}
