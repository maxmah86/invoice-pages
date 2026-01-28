async function sha256(message) {
  const data = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestPost({ request, env }) {

  /* ===============================
     AUTH CHECK (ADMIN ONLY)
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  const admin = await env.DB.prepare(`
    SELECT id, username, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!admin) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  if (admin.role !== "admin") {
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
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

  const { user_id, new_password } = body || {};

  if (!user_id || !new_password) {
    return new Response(
      JSON.stringify({ error: "Missing data" }),
      { status: 400 }
    );
  }

  if (new_password.length < 6) {
    return new Response(
      JSON.stringify({ error: "Password too short" }),
      { status: 400 }
    );
  }

  /* ===============================
     PREVENT SELF RESET
     =============================== */
  if (Number(user_id) === admin.id) {
    return new Response(
      JSON.stringify({ error: "Cannot reset your own password" }),
      { status: 400 }
    );
  }

  /* ===============================
     HASH & UPDATE
     =============================== */
  const password_hash = await sha256(new_password);

  const result = await env.DB.prepare(`
    UPDATE users
    SET password_hash = ?
    WHERE id = ?
  `).bind(password_hash, user_id).run();

  if (result.meta.changes === 0) {
    return new Response(
      JSON.stringify({ error: "User not found" }),
      { status: 404 }
    );
  }

  /* ===============================
     RESPONSE
     =============================== */
  return new Response(
    JSON.stringify({
      success: true,
      user_id
    }),
    {
      headers: { "Content-Type": "application/json" }
    }
  );
}
