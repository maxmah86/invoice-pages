async function sha256(message) {
  const data = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestPost({ request, env }) {

  const { username, password } = await request.json();

  const user = await env.DB.prepare(`
    SELECT id, password_hash, role
    FROM users
    WHERE username = ?
  `).bind(username).first();

  if (!user) {
    return new Response("Invalid username or password", { status: 401 });
  }

  const hash = await sha256(password);
  if (hash !== user.password_hash) {
    return new Response("Invalid username or password", { status: 401 });
  }

  const token = crypto.randomUUID();

  await env.DB.prepare(`
    UPDATE users
    SET session_token = ?
    WHERE id = ?
  `).bind(token, user.id).run();

  return new Response(
    JSON.stringify({ success: true, role: user.role }),
    {
      headers: {
        "Set-Cookie": `session=${token}; Path=/; SameSite=Lax`
      }
    }
  );
}
