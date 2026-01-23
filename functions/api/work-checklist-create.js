export async function onRequestPost({ request, env }) {

  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { quotation_id } = await request.json();
  if (!quotation_id) {
    return new Response("Invalid data", { status: 400 });
  }

  const q = await env.DB.prepare(`
    SELECT status
    FROM quotations
    WHERE id = ?
  `).bind(quotation_id).first();

  if (!q || q.status !== "ACCEPTED") {
    return new Response("Quotation not accepted", { status: 400 });
  }

  const r = await env.DB.prepare(`
    INSERT INTO work_checklists (quotation_id)
    VALUES (?)
  `).bind(quotation_id).run();

  const checklist_id = r.meta.last_row_id;

  const items = await env.DB.prepare(`
    SELECT description
    FROM quotation_items
    WHERE quotation_id = ?
  `).bind(quotation_id).all();

  for (const it of items.results) {
    await env.DB.prepare(`
      INSERT INTO work_checklist_items (
        work_checklist_id,
        description
      ) VALUES (?, ?)
    `).bind(
      checklist_id,
      it.description
    ).run();
  }

  return Response.json({
    success: true,
    work_checklist_id: checklist_id
  });
}
