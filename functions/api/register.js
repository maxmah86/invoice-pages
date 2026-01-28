async function sha256(message) {
  const data = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestPost({ request, env }) {

  /* ===============================
     REGISTRATION SWITCH
     =============================== */
  if (!env.REGISTER_INVITE_CODE) {
    return new Response(
      JSON.stringify({ error: "Registration disabled" }),
      { status: 403 }
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

  const { username, password, invite_code } = body || {};

  if (!username || !password || !invite_code) {
    return new Response(
      JSON.stringify({ error: "Missing required fields" }),
      { status: 400 }
    );
  }

  /* ===============================
     INVITE CODE CHECK
     =============================== */
  if (invite_code !== env.REGISTER_INVITE_CODE) {
    return new Response(
      JSON.stringify({ error: "Invalid invite code" }),
      { status: 403 }
    );
  }

  if (password.length < 6) {
    return new Response(
      JSON.stringify({ error: "Password too short" }),
      { status: 400 }
    );
  }

  /* ===============================
     DUPLICATE USER CHECK
     =============================== */
  const exists = await env.DB.prepare(`
    SELECT id
    FROM users
    WHERE username = ?
  `).bind(username).first();

  if (exists) {
    return new Response(
      JSON.stringify({ error: "Username already exists" }),
      { status: 409 }
    );
  }

  /* ===============================
     HASH PASSWORD
     =============================== */
  const password_hash = await sha256(password);

  /* ===============================
     INSERT USER (ROLE FIXED = user)
     =============================== */
  await env.DB.prepare(`
    INSERT INTO users (
      username,
      password_hash,
      role,
      created_at
    ) VALUES (?, ?, 'user', datetime('now'))
  `).bind(
    username,
    password_hash
  ).run();

  /* ===============================
     RESPONSE
     =============================== */
  return new Response(
    JSON.stringify({
      success: true,
      username
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
