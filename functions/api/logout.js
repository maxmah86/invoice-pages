export async function onRequestPost({ request, env }) {

  const cookie = request.headers.get("Cookie") || "";
  const session = cookie
    .split(";")
    .map(v => v.trim())
    .find(v => v.startsWith("session="));

  if (session) {
    const token = session.split("=")[1];
    await env.DB.prepare(`
      UPDATE users SET session_token = NULL WHERE session_token = ?
    `).bind(token).run();
  }

  return new Response("OK", {
    headers: {
      "Set-Cookie": "session=; Path=/; Max-Age=0"
    }
  });
}
