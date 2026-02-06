export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) return new Response("Missing ID", { status: 400 });

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

  if (!checklist) return new Response("Not Found", { status: 404 });

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
