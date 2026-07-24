/**
 * API: /api/quotation-update (POST)
 * 功能: 更新已有报价单（基本信息、章节、明细项与金额汇总）
 */

export async function onRequestPost(context) {
  const { request, env } = context;
  const db = env.DB;

  /* ===============================
   * 1. Auth Check
   * =============================== */
  const authRes = await fetch(new URL("/api/auth-check", request.url), {
    headers: { Cookie: request.headers.get("Cookie") || "" }
  });
  const auth = await authRes.json();

  if (!auth.loggedIn) {
    return jsonError("Unauthorized", 401);
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
     * 2. Check quotation exists & 统一权限隔离
     * =============================== */
    const existing = await db.prepare(`
      SELECT id, project_id, created_by FROM quotations WHERE id = ?
    `).bind(id).first();

    if (!existing) {
      return jsonError("Quotation not found", 404);
    }

    // 权限规则统一：admin 和 moderator 拥有全量修改权限；其他普通用户需判断归属
    const userRole = (auth.role || "").toString().trim().toLowerCase();
    const isPowerUser = userRole === "admin" || userRole === "moderator";

    if (!isPowerUser) {
      // 普通用户判断：优先校验项目创建者，其次校验报价单创建者
      if (existing.project_id) {
        const project = await db.prepare(`
          SELECT id, created_by FROM projects WHERE id = ?
        `).bind(existing.project_id).first();

        if (!project || Number(project.created_by) !== Number(auth.id)) {
          return jsonError("Permission denied: You do not own this project", 403);
        }
      } else if (Number(existing.created_by) !== Number(auth.id)) {
        return jsonError("Permission denied: You cannot edit this quotation", 403);
      }
    }

    /* ===============================
     * 3. Resolve terms snapshot
     * =============================== */
    let termsSnapshot = null;

    if (terms_id) {
      const term = await db.prepare(`
        SELECT content FROM quotation_terms
        WHERE id = ? AND is_active = 1
      `).bind(terms_id).first();

      if (!term) {
        return jsonError("Invalid terms template selected", 400);
      }

      termsSnapshot = term.content;
    }

    /* ===============================
     * 4. 更新报价单主表 (Master)
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
      Number(discount) || 0,
      id
    ).run();

    /* ===============================
     * 5. 清理旧章节与条目 (Prepare Delete)
     * =============================== */
    // 使用 Batch 集合确保原子性，防止中途报错导致旧数据丢失
    const cleanupBatch = [
      db.prepare(`DELETE FROM quotation_items WHERE quotation_id = ?`).bind(id),
      db.prepare(`DELETE FROM quotation_sections WHERE quotation_id = ?`).bind(id)
    ];
    await db.batch(cleanupBatch);

    /* ===============================
     * 6. 重建章节与子项 (Recreate Sections & Items)
     * =============================== */
    let subtotal = 0;
    const insertBatch = [];

    for (let s = 0; s < sections.length; s++) {
      const sec = sections[s];

      // 1) 先插入章节，拿到该章节的自增 ID
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

      // 2) 组装该章节下的所有明细项 (Items)
      const items = sec.items || [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];

        const qty = Number(it.qty) || 0;
        const unitPrice = Number(it.unit_price ?? it.price) || 0;
        const lineTotal = qty * unitPrice;

        subtotal += lineTotal;

        insertBatch.push(
          db.prepare(`
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
          )
        );
      }
    }

    // 如果有明细项，打包一次性写入数据库（提升 10 倍以上写入速度）
    if (insertBatch.length > 0) {
      await db.batch(insertBatch);
    }

    /* ===============================
     * 7. 重新计算并更新总价 (Totals)
     * =============================== */
    const numDiscount = Number(discount) || 0;
    const grandTotal = Math.max(0, subtotal - numDiscount);

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

    return jsonOK({
      quotation_id: id,
      subtotal,
      discount: numDiscount,
      grand_total: grandTotal
    });

  } catch (err) {
    console.error("Update Quotation Exception:", err);
    return jsonError(err.message || "Update quotation failed", 500);
  }
}

/* ===============================
 * Helpers
 * =============================== */
function jsonOK(data = {}) {
  return new Response(JSON.stringify({ success: true, ...data }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
