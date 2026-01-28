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
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { username, password, invite_code } = body || {};

  if (!username || !password || !invite_code) {
    return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 });
  }

  if (password.length < 6) {
    return new Response(JSON.stringify({ error: "Password too short" }), { status: 400 });
  }

  /* ===============================
     CHECK INVITE CODE
     =============================== */
  const invite = await env.DB.prepare(`
    SELECT *
    FROM invite_codes
    WHERE code = ?
  `).bind(invite_code).first();

  if (!invite) {
    return new Response(JSON.stringify({ error: "Invalid invite code" }), { status: 403 });
  }

  if (invite.is_used) {
    return new Response(JSON.stringify({ error: "Invite code already used" }), { status: 403 });
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return new Response(JSON.stringify({ error: "Invite code expired" }), { status: 403 });
  }

  /* ===============================
     DUPLICATE USER CHECK
     =============================== */
  const exists = await env.DB.prepare(`
    SELECT id FROM users WHERE username = ?
  `).bind(username).first();

  if (exists) {
    return new Response(JSON.stringify({ error: "Username already exists" }), { status: 409 });
  }

  /* ===============================
     CREATE USER
     =============================== */
  const password_hash = await sha256(password);

  await env.DB.prepare(`
    INSERT INTO users (
      username,
      password_hash,
      role,
      created_at
    ) VALUES (?, ?, ?, datetime('now'))
  `).bind(
    username,
    password_hash,
    invite.role || "user"
  ).run();

  /* ===============================
     MARK INVITE AS USED
     =============================== */
  await env.DB.prepare(`
    UPDATE invite_codes
    SET is_used = 1,
        used_at = datetime('now')
    WHERE id = ?
  `).bind(invite.id).run();

  return Response.json({
    success: true,
    username,
    role: invite.role || "user"
  });
}
