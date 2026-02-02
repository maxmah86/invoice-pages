export async function onRequestGet(context) {
  const { request, env } = context;
  const db = env.DB;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return jsonError("Quotation ID required", 400);
  }

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
    /* ===============================
     * 1. Quotation main
     * =============================== */
    const quotation = await db.prepare(`
      SELECT *
      FROM quotations
      WHERE id = ?
    `).bind(id).first();

    if (!quotation) {
      return jsonError("Quotation not found", 404);
    }

    /* ===============================
     * 2. Sections
     * =============================== */
    const secRes = await db.prepare(`
      SELECT *
      FROM quotation_sections
      WHERE quotation_id = ?
      ORDER BY sort_order ASC
    `).bind(id).all();

    /* ===============================
     * 3. Items
     * =============================== */
    const itemRes = await db.prepare(`
      SELECT *
      FROM quotation_items
      WHERE quotation_id = ?
      ORDER BY sort_order ASC, id ASC
    `).bind(id).all();

    const sections = secRes.results || [];
    const items = itemRes.results || [];

    /* ===============================
     * 4. Attach items to sections
     * =============================== */
    const sectionMap = {};

    sections.forEach(sec => {
      sectionMap[sec.id] = {
        ...sec,
        items: []
      };
    });

    const noSectionItems = [];

    items.forEach(it => {
      if (it.section_id && sectionMap[it.section_id]) {
        sectionMap[it.section_id].items.push(it);
      } else {
        // 👇 没有 section 的 item
        noSectionItems.push(it);
      }
    });

    let finalSections = Object.values(sectionMap);

    /* ===============================
     * 5. 🔥 方案 A：虚拟 Section
     * =============================== */
    if (noSectionItems.length > 0) {
      finalSections.unshift({
        id: null,
        section_title: "Items",
        sort_order: -1,
        items: noSectionItems
      });
    }

    /* ===============================
     * 6. Response
     * =============================== */
    return jsonOK({
      ...quotation,
      sections: finalSections
    });

  } catch (err) {
    console.error(err);
    return jsonError(err.message || "Load quotation failed", 500);
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
