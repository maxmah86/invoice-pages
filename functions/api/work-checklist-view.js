export async function onRequestGet({ request, env }) {

  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return new Response("Missing id", { status: 400 });
  }

  const checklist = await env.DB.prepare(`
    SELECT
      id,
      quotation_id,
      status,
      created_at
    FROM work_checklists
    WHERE id = ?
  `).bind(id).first();

  if (!checklist) {
    return new Response("Not found", { status: 404 });
  }

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
    items: items.results
  });
}
