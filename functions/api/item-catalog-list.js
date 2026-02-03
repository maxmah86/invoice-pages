export async function onRequestGet(context) {
  const { request, env } = context;
  const db = env.DB;

  /* ===============================
   * Admin auth
   * =============================== */
  const authRes = await fetch(new URL("/api/auth-check", request.url), {
    headers: { Cookie: request.headers.get("Cookie") || "" }
  });
  const auth = await authRes.json();

  if (!auth.loggedIn || auth.role !== "admin") {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const rows = await db.prepare(`
      SELECT
        id,
        description,
        category,          -- ⭐ 新增
        default_amount,
        is_active,
        created_at
      FROM item_catalogs
      ORDER BY created_at DESC
    `).all();

    return new Response(JSON.stringify(rows.results || []), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error(err);
    return new Response("Failed to load item catalogs", { status: 500 });
  }
}