export async function onRequestPost({ request, env }) {

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

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { item_id, status } = body || {};
  if (!item_id || !status) {
    return new Response("Invalid data", { status: 400 });
  }

  const ALLOWED = ["NOT_STARTED", "IN_PROGRESS", "DONE"];
  if (!ALLOWED.includes(status)) {
    return new Response("Invalid status", { status: 400 });
  }

  const r = await env.DB.prepare(`
    UPDATE work_checklist_items
    SET status = ?
    WHERE id = ?
  `).bind(status, item_id).run();

  if (r.meta.changes === 0) {
    return new Response("Item not found", { status: 404 });
  }

  const parent = await env.DB.prepare(`
    SELECT work_checklist_id
    FROM work_checklist_items
    WHERE id = ?
  `).bind(item_id).first();

  if (parent) {
    const stats = await env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END) AS done
      FROM work_checklist_items
      WHERE work_checklist_id = ?
    `).bind(parent.work_checklist_id).first();

    let checklistStatus = "NOT_STARTED";
    if (stats.done === stats.total) {
      checklistStatus = "DONE";
    } else if (stats.done > 0) {
      checklistStatus = "IN_PROGRESS";
    }

    await env.DB.prepare(`
      UPDATE work_checklists
      SET status = ?
      WHERE id = ?
    `).bind(checklistStatus, parent.work_checklist_id).run();
  }

  return Response.json({
    success: true,
    item_id,
    status,
    updated_by: user.username,
    role: user.role
  });
}
