export async function onRequestGet({ request, env }) {
  try {
    /* ===============================
       AUTH CHECK (session_token)
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
      SELECT id, role
      FROM users
      WHERE session_token = ?
    `).bind(token).first();

    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401 }
      );
    }

    /* ===============================
       DB SAFETY
       =============================== */
    if (!env.DB) {
      return new Response(
        JSON.stringify({ error: "DB not bound" }),
        { status: 500 }
      );
    }

    /* ===============================
       QUERY TERMS
       =============================== */
    const result = await env.DB.prepare(`
      SELECT
        id,
        title
      FROM quotation_terms
      WHERE is_active = 1
      ORDER BY sort_order ASC, id ASC
    `).all();

    return new Response(
      JSON.stringify(result.results),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "quotation-terms-list failed",
        detail: String(err)
      }),
      { status: 500 }
    );
  }
}
