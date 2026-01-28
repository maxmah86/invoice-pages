export async function onRequestPost({ request, env }) {

  /* ===============================
     AUTH CHECK (session_token)
     =============================== */
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

  /* ===== ONLY ADMIN CAN ACCEPT ===== */
  if (user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  /* ===============================
     PARSE BODY
     =============================== */
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { id } = body;
  if (!id) {
    return new Response("Invalid data", { status: 400 });
  }

  /* ===============================
     LOAD QUOTATION
     =============================== */
  const q = await env.DB.prepare(`
    SELECT status
    FROM quotations
    WHERE id = ?
  `).bind(id).first();

  if (!q || q.status !== "OPEN") {
    return new Response("Quotation not acceptable", { status: 400 });
  }

  /* ===============================
     CHECK EXISTING CHECKLIST
     =============================== */
  const exists = await env.DB.prepare(`
    SELECT id
    FROM work_checklists
    WHERE quotation_id = ?
  `).bind(id).first();

  /* ===============================
     ACCEPT QUOTATION
     =============================== */
  await env.DB.prepare(`
    UPDATE quotations
    SET status = 'ACCEPTED'
    WHERE id = ?
  `).bind(id).run();

  /* ===============================
     CREATE CHECKLIST (IF NOT EXISTS)
     =============================== */
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
          description,
          status
        ) VALUES (?, ?, 'NOT_STARTED')
      `).bind(
        checklist_id,
        it.description
      ).run();
    }
  }

  /* ===============================
     RESPONSE
     =============================== */
  return Response.json({
    success: true,
    accepted_by: user.username,
    role: user.role
  });
}
