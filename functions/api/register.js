async function sha256(message) {
  const data = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestPost({ request, env }) {

  /* ===============================
     PARSE BODY
     =============================== */
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { username, password } = body || {};

  if (!username || !password) {
    return new Response("Missing username or password", { status: 400 });
  }

  if (username.length < 3) {
    return new Response("Username too short", { status: 400 });
  }

  if (password.length < 6) {
    return new Response("Password too short", { status: 400 });
  }

  /* ===============================
     CHECK DUPLICATE USERNAME
     =============================== */
  const exists = await env.DB.prepare(`
    SELECT id
    FROM users
    WHERE username = ?
  `).bind(username).first();

  if (exists) {
    return new Response("Username already exists", { status: 409 });
  }

  /* ===============================
     HASH PASSWORD
     =============================== */
  const password_hash = await sha256(password);

  /* ===============================
     INSERT USER
     role 默认 user
     =============================== */
  await env.DB.prepare(`
    INSERT INTO users (
      username,
      password_hash,
      created_at
    ) VALUES (?, ?, datetime('now'))
  `).bind(
    username,
    password_hash
  ).run();

  /* ===============================
     RESPONSE
     =============================== */
  return new Response(
    JSON.stringify({ success: true }),
    { headers: { "Content-Type": "application/json" } }
  );
}
