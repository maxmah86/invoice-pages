export async function onRequestPost(context) {
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
    return jsonError("Permission denied", 403);
  }

  try {
    const body = await request.json();
    const {
      id,
      description,
      category,          // ⭐ 新增
      default_amount = 0,
      is_active = true
    } = body;

    if (!description) {
      return jsonError("Description required", 400);
    }

    /* ===============================
     * UPDATE
     * =============================== */
    if (id) {
      await db.prepare(`
        UPDATE item_catalogs
        SET
          description = ?,
          category = ?,          -- ⭐ 新增
          default_amount = ?,
          is_active = ?
        WHERE id = ?
      `).bind(
        description,
        category || null,        // ⭐ 允许 null
        Number(default_amount) || 0,
        is_active ? 1 : 0,
        id
      ).run();

      return jsonOK({ updated: true });
    }

    /* ===============================
     * INSERT
     * =============================== */
    await db.prepare(`
      INSERT INTO item_catalogs (
        description,
        category,                -- ⭐ 新增
        default_amount,
        is_active,
        created_at
      )
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(
      description,
      category || null,          // ⭐ 允许 null
      Number(default_amount) || 0,
      is_active ? 1 : 0
    ).run();

    return jsonOK({ created: true });

  } catch (err) {
    console.error(err);
    return jsonError(err.message || "Save failed", 500);
  }
}

/* ===============================
 * Helpers
 * =============================== */
function jsonOK(data) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { "Content-Type": "application/json" }
  });
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}