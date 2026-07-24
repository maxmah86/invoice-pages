/**
 * API: /api/quotation-view (GET)
 * 功能: 获取单个报价单详情及其 Section / Item 数据
 * 权限规则:
 *   - Admin: 可查看所有报价单
 *   - Moderator: 只能查看自己创建的报价单，或自己创建的项目下的报价单
 */

export async function onRequestGet({ request, env }) {
  const db = env.DB;

  try {
    /* ===============================
     * 1. AUTH CHECK (鉴权)
     * =============================== */
    const cookie = request.headers.get("Cookie") || "";
    const token = cookie.match(/session=([^;]+)/)?.[1];

    if (!token) {
      return jsonError("Unauthorized", 401);
    }

    const user = await db.prepare(`
      SELECT id, username, role FROM users WHERE session_token = ?
    `).bind(token).first();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    const userRole = (user.role || "").toString().trim().toLowerCase();
    if (userRole !== "admin" && userRole !== "moderator") {
      return jsonError("Permission denied: Insufficient role", 403);
    }

    /* ===============================
     * 2. PARAM CHECK
     * =============================== */
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return jsonError("Quotation ID required", 400);
    }

    /* ===============================
     * 3. FETCH QUOTATION MAIN
     * =============================== */
    const quotation = await db.prepare(`
      SELECT * FROM quotations WHERE id = ?
    `).bind(id).first();

    if (!quotation) {
      return jsonError("Quotation not found", 404);
    }

    /* ===============================
     * 4. 权限隔离 (RESOURCE OWNERSHIP CHECK)
     * =============================== */
    if (userRole !== "admin") {
      const currentUserId = String(user.id || "").trim();
      const quotationOwnerId = String(quotation.created_by || "").trim();
      let isAllowed = quotationOwnerId !== "" && quotationOwnerId === currentUserId;

      // 如果报价单关联了项目，且不是自己创建的报价单，检查项目是否属于当前用户
      if (!isAllowed && quotation.project_id) {
        const project = await db.prepare(`
          SELECT created_by FROM projects WHERE id = ?
        `).bind(quotation.project_id).first();

        if (project && String(project.created_by || "").trim() === currentUserId) {
          isAllowed = true;
        }
      }

      if (!isAllowed) {
        return jsonError("Permission denied: You do not have access to this quotation", 403);
      }
    }

    /* ===============================
     * 5. FETCH SECTIONS & ITEMS
     * =============================== */
    const [secRes, itemRes] = await Promise.all([
      db.prepare(`
        SELECT * FROM quotation_sections
        WHERE quotation_id = ?
        ORDER BY sort_order ASC
      `).bind(id).all(),

      db.prepare(`
        SELECT * FROM quotation_items
        WHERE quotation_id = ?
        ORDER BY sort_order ASC, id ASC
      `).bind(id).all()
    ]);

    const sections = secRes?.results || [];
    const items = itemRes?.results || [];

    /* ===============================
     * 6. ATTACH ITEMS TO SECTIONS
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

    if (noSectionItems.length > 0) {
      finalSections.unshift({
        id: null,
        section_title: "Items",
        sort_order: -1,
        items: noSectionItems
      });
    }

    /* ===============================
     * 7. RESPONSE
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
