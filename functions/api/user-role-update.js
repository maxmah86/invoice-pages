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

  const { user_id, role } = body || {};

  if (!user_id || !["admin", "user"].includes(role)) {
    return new Response(
      JSON.stringify({ error: "Invalid data" }),
      { status: 400 }
    );
  }

  /* ===============================
     PREVENT SELF ROLE CHANGE
     =============================== */
  if (Number(user_id) === admin.id) {
    return new Response(
      JSON.stringify({ error: "Cannot change your own role" }),
      { status: 400 }
    );
  }

  /* ===============================
     UPDATE ROLE
     =============================== */
  const result = await env.DB.prepare(`
    UPDATE users
    SET role = ?
    WHERE id = ?
  `).bind(role, user_id).run();

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
      user_id,
      role
    }),
    {
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}
