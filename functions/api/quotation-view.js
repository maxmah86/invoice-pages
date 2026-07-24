Export async function onRequestGet({ request, env }) {
  const db = env.DB;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return jsonError("Quotation ID required", 400);
  }

  /* ===============================
   * Auth Check (允许 Admin 和 Moderator)
   * =============================== */
  const authRes = await fetch(new URL("/api/auth-check", request.url), {
    headers: {
      Cookie: request.headers.get("Cookie") || ""
    }
  });

  const auth = await authRes.json();

  if (!auth.loggedIn) {
    return jsonError("Not logged in", 401);
  }

  if (auth.role !== "admin" && auth.role !== "moderator") {
    return jsonError("Permission denied", 403);
  }

  try {
    /* ===============================
     * 1️⃣ Quotation main
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
     * 核心权限防护：关联项目归属权校验
     * =============================== */
    if (auth.role !== "admin") {
      if (quotation.project_id) {
        // 查询对应的项目创建者
        const project = await db.prepare(`
          SELECT id, created_by FROM projects WHERE id = ?
        `).bind(quotation.project_id).first();

        // 如果项目不存在，或者不是当前 Moderator 创建的，拒绝访问
        if (!project || project.created_by !== auth.id) {
          return jsonError("Permission denied: You do not have access to this quotation", 403);
        }
      } else {
        // 如果报价单未关联项目，可根据你的业务规则判断（例如不允许普通 moderator 查看未关联项目的全局报价单）
        // 或者如果 quotations 表也有 created_by 字段，则校验 quotation.created_by === auth.id
      }
    }

    /* ===============================
     * 2️⃣ Sections
     * =============================== */
    const secRes = await db.prepare(`
      SELECT *
      FROM quotation_sections
      WHERE quotation_id = ?
      ORDER BY sort_order ASC
    `).bind(id).all();

    /* ===============================
     * 3️⃣ Items
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
     * 4️⃣ Attach items to sections
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
        noSectionItems.push(it);
      }
    });

    let finalSections = Object.values(sectionMap);

    /* ===============================
     * 5️⃣ Virtual section (optional)
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
     * 6️⃣ Response
     * =============================== */
    return jsonOK({
      ...quotation,
      sections: finalSections
    });

  } catch (err) {
    console.error("quotation-view error:", err);
    return jsonError(err.message || "Load quotation failed", 500);
  }
}

/* ===============================
 * Helpers
 * =============================== */
function jsonOK(data) {
  return new Response(
    JSON.stringify({ success: true, data }),
    { headers: { "Content-Type": "application/json" } }
  );
}

function jsonError(message, status = 400) {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
