export async function onRequestPost({ request, env }) {

  /* ===== AUTH CHECK ===== */
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

  if (user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  /* ===== INPUT ===== */
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { quotation_id } = body || {};
  if (!quotation_id) {
    return new Response("Missing quotation_id", { status: 400 });
  }

  /* ===== CHECK QUOTATION ===== */
  const quotation = await env.DB.prepare(`
    SELECT id, status
    FROM quotations
    WHERE id = ?
  `).bind(quotation_id).first();

  if (!quotation || quotation.status !== "ACCEPTED") {
    return new Response("Quotation not accepted", { status: 400 });
  }

  /* ===== CREATE CHECKLIST ===== */
  const r = await env.DB.prepare(`
    INSERT INTO work_checklists (
      quotation_id,
      status
    ) VALUES (?, 'NOT_STARTED')
  `).bind(quotation_id).run();

  const checklist_id = r.meta.last_row_id;

  /* ===== COPY ITEMS ===== */
  const items = await env.DB.prepare(`
    SELECT description
    FROM quotation_items
    WHERE quotation_id = ?
  `).bind(quotation_id).all();

  for (const it of items.results) {
    await env.DB.prepare(`
      INSERT INTO work_checklist_items (
        work_checklist_id,
        description,
        status
      ) VALUES (?, ?, 'NOT_STARTED')
    `).bind(
      checklist_id,
      it.description
    ).run();
  }

  /* ===== RESPONSE ===== */
  return Response.json({
    success: true,
    work_checklist_id: checklist_id,
    created_by: user.username
  });
}
