export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;

  /* ===============================
   * 1. Admin Auth
   * =============================== */
  const authRes = await fetch(new URL('/api/auth-check', request.url), {
    headers: { Cookie: request.headers.get('Cookie') || '' }
  });
  const auth = await authRes.json();

  if (!auth.loggedIn || auth.role !== 'admin') {
    return jsonError('Permission denied', 403);
  }

  try {
    const body = await request.json();
    const { quotation_id } = body;

    if (!quotation_id) {
      return jsonError('quotation_id required', 400);
    }

    /* ===============================
     * 2. Check quotation
     * =============================== */
    const quotation = await db.prepare(
      `SELECT id FROM quotations WHERE id = ?`
    ).bind(quotation_id).first();

    if (!quotation) {
      return jsonError('Quotation not found', 404);
    }

    /* ===============================
     * 3. Create work checklist
     * =============================== */
    const wcRes = await db.prepare(`
      INSERT INTO work_checklists (
        quotation_id,
        status,
        created_at
      )
      VALUES (?, 'NOT_STARTED', datetime('now'))
    `).bind(quotation_id).run();

    const workChecklistId = wcRes.meta.last_row_id;

    /* ===============================
     * 4. Load quotation sections
     * =============================== */
    const sectionsRes = await db.prepare(`
      SELECT id, section_title
      FROM quotation_sections
      WHERE quotation_id = ?
      ORDER BY sort_order
    `).bind(quotation_id).all();

    /* ===============================
     * 5. Loop sections → items
     * =============================== */
    for (const sec of sectionsRes.results || []) {

      /* ----- 5.1 Insert SECTION (only as header) ----- */
      if (sec.section_title) {
        await db.prepare(`
          INSERT INTO work_checklist_items (
            work_checklist_id,
            description,
            status,
            created_at
          )
          VALUES (?, ?, 'SECTION', datetime('now'))
        `).bind(
          workChecklistId,
          sec.section_title
        ).run();
      }

      /* ----- 5.2 Load items under this section ----- */
      const itemsRes = await db.prepare(`
        SELECT description, UOM, qty
        FROM quotation_items
        WHERE quotation_id = ?
          AND section_id = ?
        ORDER BY sort_order
      `).bind(
        quotation_id,
        sec.id
      ).all();

      /* ----- 5.3 Insert real checklist items ----- */
      for (const it of itemsRes.results || []) {
        if (!it.description) continue;

        const parts = [];
        parts.push(it.description);

        if (it.qty !== null && it.qty !== undefined) {
          parts.push(`Qty: ${it.qty}`);
        }

        if (it.UOM) {
          parts.push(`UOM: ${it.UOM}`);
        }

        await db.prepare(`
          INSERT INTO work_checklist_items (
            work_checklist_id,
            description,
            status,
            created_at
          )
          VALUES (?, ?, 'NOT_STARTED', datetime('now'))
        `).bind(
          workChecklistId,
          parts.join(' | ')
        ).run();
      }
    }

    return jsonOK({
      work_checklist_id: workChecklistId
    });

  } catch (err) {
    console.error(err);
    return jsonError(
      err.message || 'Create work checklist failed',
      500
    );
  }
}

/* ===============================
 * Helpers
 * =============================== */
function jsonOK(data) {
  return new Response(JSON.stringify({ success: true, ...data }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
