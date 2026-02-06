export async function onRequestPost({ request, env }) {
  try {
    /* ===== Auth ===== */
    const cookie = request.headers.get("Cookie") || "";
    const token = cookie.match(/session=([^;]+)/)?.[1];
    if (!token) {
      return new Response("Unauthorized", { status: 401 });
    }

    const user = await env.DB.prepare(`
      SELECT id, username, role
      FROM users
      WHERE session_token = ?
    `).bind(token).first();

    if (!user || user.role !== "admin") {
      return new Response("Forbidden", { status: 403 });
    }

    /* ===== Input ===== */
    const body = await request.json();
    const checklistId = parseInt(body.id, 10);

    if (!Number.isInteger(checklistId)) {
      return new Response("Invalid checklist id", { status: 400 });
    }

    console.log("DELETE checklist id =", checklistId);

    /* ===== Delete checklist ===== */
    const r1 = await env.DB.prepare(`
      DELETE FROM work_checklists
      WHERE id = ?
    `).bind(checklistId).run();

    const r2 = await env.DB.prepare(`
      DELETE FROM work_checklist_items
      WHERE work_checklist_id = ?
    `).bind(checklistId).run();

    console.log("deleted checklist:", r1.meta.changes);
    console.log("deleted items:", r2.meta.changes);

    if (r1.meta.changes === 0) {
      return new Response("Checklist not found", { status: 404 });
    }

    return Response.json({
      success: true,
      checklist_id: checklistId,
      deleted_items: r2.meta.changes,
      deleted_by: user.username
    });

  } catch (err) {
    console.error("DELETE CHECKLIST ERROR:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
}
