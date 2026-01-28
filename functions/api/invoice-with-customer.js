export async function onRequestPost({ request, env }) {
  try {
    /* ===============================
       AUTH CHECK (session_token)
       =============================== */
    const cookie = request.headers.get("Cookie") || "";
    const token = cookie.match(/session=([^;]+)/)?.[1];

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
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
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    /* ===============================
       ROLE CHECK (ADMIN ONLY)
       =============================== */
    if (user.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    /* ===============================
       PROXY REQUEST
       =============================== */
    const body = await request.text();

    const res = await fetch(
      "https://invoice-api.myfong86.workers.dev/invoice-with-customer",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
          // ❌ 不再信任 client 的 Authorization
        },
        body
      }
    );

    const text = await res.text();

    return new Response(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" }
    });

  } catch (e) {
    return new Response(
      JSON.stringify({
        error: "invoice-with-customer proxy error",
        detail: String(e)
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
