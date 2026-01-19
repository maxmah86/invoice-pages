export async function onRequestGet({ request, env }) {

  try {
    /* ===== AUTH CHECK ===== */
    const auth = await fetch(new URL("/api/auth-check", request.url), {
      headers: {
        cookie: request.headers.get("cookie") || ""
      }
    });

    if (!auth.ok) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401 }
      );
    }

    /* ===== SAFETY CHECK ===== */
    if (!env.DB) {
      return new Response(
        JSON.stringify({ error: "DB not bound" }),
        { status: 500 }
      );
    }

    /* ===== QUERY TERMS ===== */
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
