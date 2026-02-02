export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;

  /* ===============================
   * Admin auth
   * =============================== */
  const authRes = await fetch(new URL("/api/auth-check", request.url), {
    headers: { Cookie: request.headers.get("Cookie") || "" }
  });
  const auth = await authRes.json();

  if (!auth.loggedIn || auth.role !== "admin") {
    return jsonError("Permission denied", 403);
  }

  try {
    const body = await request.json();
    const {
      id,
      customer,
      project_title,
      project_address,
      terms_id,
      discount = 0,
      sections = []
    } = body;

    if (!id) return jsonError("Missing quotation id", 400);
    if (!customer) return jsonError("Customer required", 400);

    /* ===============================
     * Check quotation exists
     * =============================== */
    const existing = await db.prepare(`
      SELECT id FROM quotations WHERE id = ?
    `).bind(id).first();

    if (!existing) {
      return jsonError("Quotation not found", 404);
    }

    /* ===============================
     * Resolve terms snapshot (KEY FIX)
     * =============================== */
    let termsSnapshot = null;

    if (terms_id) {
      const term = await db.prepare(`
        SELECT content FROM quotation_terms
        WHERE id = ? AND is_active = 1
      `).bind(terms_id).first();

      if (!term) {
        return jsonError("Invalid terms", 400);
      }

      termsSnapshot = term.content;
    }

    /* ===============================
     * Update quotation master
     * =============================== */
    await db.prepare(`
      UPDATE quotations
      SET
        customer = ?,
        project_title = ?,
        project_address = ?,
        terms_id = ?,
        terms_snapshot = ?,
        discount = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      customer,
      project_title || null,
      project_address || null,
      terms_id || null,
      termsSnapshot,
      discount,
      id
    ).run();

    /* ===============================
     * Clear old sections & items
     * =============================== */
    await db.prepare(`
      DELETE FROM quotation_items WHERE quotation_id = ?
    `).bind(id).run();

    await db.prepare(`
      DELETE FROM quotation_sections WHERE quotation_id = ?
    `).bind(id).run();

    /* ===============================
     * Recreate sections & items
     * =============================== */
    let subtotal = 0;

    for (let s = 0; s < sections.length; s++) {
      const sec = sections[s];

      const secRes = await db.prepare(`
        INSERT INTO quotation_sections (
          quotation_id,
          section_title,
          sort_order,
          created_at
        )
        VALUES (?, ?, ?, datetime('now'))
      `).bind(
        id,
        sec.section_title || "",
        s
      ).run();

      const sectionId = secRes.meta.last_row_id;

      for (let i = 0; i < (sec.items || []).length; i++) {
        const it = sec.items[i];

        const qty = Number(it.qty) || 0;
        const unitPrice =
          Number(it.unit_price ?? it.price) || 0;

        const lineTotal = qty * unitPrice;
        subtotal += lineTotal;

        await db.prepare(`
          INSERT INTO quotation_items (
            quotation_id,
            item_no,
            description,
            UOM,
            qty,
            unit_price,
            line_total,
            section_id,
            sort_order,
            is_priced
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).bind(
          id,
          String(i + 1),
          it.description || "",
          it.UOM || "",
          qty,
          unitPrice,
          lineTotal,
          sectionId,
          i
        ).run();
      }
    }

    /* ===============================
     * Update totals
     * =============================== */
    const grandTotal = Math.max(0, subtotal - discount);

    await db.prepare(`
      UPDATE quotations
      SET
        subtotal = ?,
        grand_total = ?
      WHERE id = ?
    `).bind(
      subtotal,
      grandTotal,
      id
    ).run();

    return jsonOK({ success: true });

  } catch (err) {
    console.error(err);
    return jsonError(err.message || "Update quotation failed", 500);
  }
}

/* ===============================
 * Helpers
 * =============================== */
function jsonOK(data) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { "Content-Type": "application/json" }
  });
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}