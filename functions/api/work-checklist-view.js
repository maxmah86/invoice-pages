export async function onRequestGet({ request, env }) {

  /* ===============================
     AUTH CHECK
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await env.DB.prepare(`
    SELECT id, role FROM users WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  /* ===============================
     LOAD CHECKLIST
     =============================== */
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) return Response.json({ error: "Missing ID" }, { status: 400 });

  // 关联查询以获取项目标题和地址
  const checklist = await env.DB.prepare(`
    SELECT 
      c.*, 
      q.quotation_no, 
      q.project_title, 
      q.project_address
    FROM work_checklists c
    JOIN quotations q ON c.quotation_id = q.id
    WHERE c.id = ?
  `).bind(id).first();

  if (!checklist) return Response.json({ error: "Not Found" }, { status: 404 });

  const items = await env.DB.prepare(`
    SELECT * FROM work_checklist_items 
    WHERE work_checklist_id = ?
    ORDER BY id ASC
  `).bind(id).all();

  return Response.json({
    checklist,
    items: items.results
  });
}
