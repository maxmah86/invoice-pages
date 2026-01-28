export async function onRequestGet({ request, env }) {

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

  const user = await env.DB.prepare(`
    SELECT id, username, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  if (user.role !== "admin") {
    return new Response(
      JSON.stringify({ error: "Forbidden" }),
      { status: 403 }
    );
  }

  /* ===============================
     QUERY USERS
     =============================== */
  const result = await env.DB.prepare(`
    SELECT
      id,
      username,
      role,
      created_at
    FROM users
    ORDER BY role DESC, created_at ASC
  `).all();

  /* ===============================
     RESPONSE
     =============================== */
  return new Response(
    JSON.stringify(result.results || []),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );
}
