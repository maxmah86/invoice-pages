export async function onRequestPost({ request, env }) {

  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await request.json();
  if (!id) {
    return new Response("Invalid data", { status: 400 });
  }

  const q = await env.DB.prepare(`
    SELECT status
    FROM quotations
    WHERE id = ?
  `).bind(id).first();

  if (!q || q.status !== "OPEN") {
    return new Response("Quotation not acceptable", { status: 400 });
  }

  const exists = await env.DB.prepare(`
    SELECT id
    FROM work_checklists
    WHERE quotation_id = ?
  `).bind(id).first();

  await env.DB.prepare(`
    UPDATE quotations
    SET status = 'ACCEPTED'
    WHERE id = ?
  `).bind(id).run();

  if (!exists) {
    const r = await env.DB.prepare(`
      INSERT INTO work_checklists (quotation_id)
      VALUES (?)
    `).bind(id).run();

    const checklist_id = r.meta.last_row_id;

    const items = await env.DB.prepare(`
      SELECT description
      FROM quotation_items
      WHERE quotation_id = ?
    `).bind(id).all();

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
  }

  return Response.json({
    success: true
  });
}
