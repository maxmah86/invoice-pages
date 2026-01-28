export async function onRequestGet({ request, env }) {

  /* ===== Auth (统一 session_token) ===== */
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

  /* ===== Params ===== */
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return new Response("Missing id", { status: 400 });
  }

  /* ===== Checklist Header + Quotation ===== */
  const checklist = await env.DB.prepare(`
    SELECT
      wc.id,
      wc.quotation_id,
      wc.status,
      wc.created_at,
      q.quotation_no
    FROM work_checklists wc
    LEFT JOIN quotations q ON q.id = wc.quotation_id
    WHERE wc.id = ?
  `).bind(id).first();

  if (!checklist) {
    return new Response("Not found", { status: 404 });
  }

  /* ===== Items ===== */
  const items = await env.DB.prepare(`
    SELECT
      id,
      description,
      status,
      remarks
    FROM work_checklist_items
    WHERE work_checklist_id = ?
    ORDER BY id ASC
  `).bind(id).all();

  return Response.json({
    checklist,
    quotation_no: checklist.quotation_no,
    items: items.results,
    user: {
      username: user.username,
      role: user.role
    }
  });
}
