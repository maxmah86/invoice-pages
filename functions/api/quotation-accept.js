export async function onRequestPost({ request, env }) {
  /* ===== 1. 身份验证 ===== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];
  if (!token) return new Response("Unauthorized", { status: 401 });

  const user = await env.DB.prepare(`
    SELECT username, role FROM users WHERE session_token = ?
  `).bind(token).first();
  
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });

  /* ===== 2. 解析数据 ===== */
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response("Invalid JSON", { status: 400 });
  }
  
  const id = body.id || body.quotation_id; 
  if (!id) return new Response("Missing ID", { status: 400 });

  /* ===== 3. 检查报价单状态 ===== */
  const q = await env.DB.prepare(`SELECT status FROM quotations WHERE id = ?`).bind(id).first();
  if (!q || q.status.toUpperCase() !== "OPEN") {
    return new Response("Quotation must be OPEN to accept", { status: 400 });
  }

  /* ===== 4. 更新报价单状态 ===== */
  await env.DB.prepare(`
    UPDATE quotations 
    SET status = 'ACCEPTED', updated_at = datetime('now') 
    WHERE id = ?
  `).bind(id).run();

  /* ===== 5. 生成 Checklist (100% 对应 work-checklist-create 逻辑) ===== */
  // 检查是否已有清单，防止重复
  const exists = await env.DB.prepare(`SELECT id FROM work_checklists WHERE quotation_id = ?`).bind(id).first();
  let checklist_id;

  if (!exists) {
    // 5.1 创建主表
    const wcRes = await env.DB.prepare(`
      INSERT INTO work_checklists (quotation_id, status, created_at) 
      VALUES (?, 'NOT_STARTED', datetime('now'))
    `).bind(id).run();
    checklist_id = wcRes.meta.last_row_id;

    // 5.2 加载所有的 Sections (分组)
    const sectionsRes = await env.DB.prepare(`
      SELECT id, section_title
      FROM quotation_sections
      WHERE quotation_id = ?
      ORDER BY sort_order ASC
    `).bind(id).all();

    // 5.3 循环分组插入
    for (const sec of sectionsRes.results || []) {
      
      // 插入 SECTION 标题行
      if (sec.section_title) {
        await env.DB.prepare(`
          INSERT INTO work_checklist_items (work_checklist_id, description, status, created_at)
          VALUES (?, ?, 'SECTION', datetime('now'))
        `).bind(checklist_id, sec.section_title).run();
      }

      // 5.4 加载该分组下的 Items
      const itemsRes = await env.DB.prepare(`
        SELECT description, UOM, qty
        FROM quotation_items
        WHERE quotation_id = ? AND section_id = ?
        ORDER BY sort_order ASC
      `).bind(id, sec.id).all();

      // 5.5 按照你要求的 "Description | Qty: X | UOM: Y" 格式插入
      for (const it of itemsRes.results || []) {
        if (!it.description) continue;

        const parts = [];
        parts.push(it.description);

        if (it.qty !== null && it.qty !== undefined && it.qty !== 0) {
          parts.push(`Qty: ${it.qty}`);
        }

        if (it.UOM) {
          parts.push(`UOM: ${it.UOM}`);
        }

        await env.DB.prepare(`
          INSERT INTO work_checklist_items (work_checklist_id, description, status, created_at)
          VALUES (?, ?, 'NOT_STARTED', datetime('now'))
        `).bind(checklist_id, parts.join(' | ')).run();
      }
    }
  } else {
    checklist_id = exists.id;
  }

  /* ===== 6. 返回结果 ===== */
  return Response.json({
    success: true,
    checklist_id: checklist_id,
    message: "Quotation accepted and items generated"
  });
}
