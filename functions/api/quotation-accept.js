export async function onRequestPost({ request, env }) {
  /* ===== 1. 身份验证 ===== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];
  if (!token) return new Response("Unauthorized", { status: 401 });

  const user = await env.DB.prepare(`
    SELECT username, role FROM users WHERE session_token = ?
  `).bind(token).first();
  
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });

  /* ===== 2. 解析数据 (仅解析一次) ===== */
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response("Invalid JSON", { status: 400 });
  }
  
  // 统一使用 id (对应前端传参)
  const id = body.id || body.quotation_id; 
  if (!id) return new Response("Missing ID", { status: 400 });

  /* ===== 3. 检查报价单状态 ===== */
  const q = await env.DB.prepare(`SELECT status FROM quotations WHERE id = ?`).bind(id).first();
  if (!q || q.status.toUpperCase() !== "OPEN") {
    return new Response("Quotation must be OPEN to accept", { status: 400 });
  }

  /* ===== 4. 更新报价单为已接受 ===== */
  // 增加 accepted_at 记录
  await env.DB.prepare(`
    UPDATE quotations 
    SET status = 'ACCEPTED', updated_at = datetime('now') 
    WHERE id = ?
  `).bind(id).run();

  /* ===== 5. 生成 Checklist (防止重复生成) ===== */
  const exists = await env.DB.prepare(`SELECT id FROM work_checklists WHERE quotation_id = ?`).bind(id).first();
  let checklist_id;

  if (!exists) {
    // 创建 Checklist 主表
    const r = await env.DB.prepare(`
      INSERT INTO work_checklists (quotation_id, status, created_at) 
      VALUES (?, 'NOT_STARTED', datetime('now'))
    `).bind(id).run();
    checklist_id = r.meta.last_row_id;

    // --- 修改点：SQL 增加 UOM 查询 ---
    const items = await env.DB.prepare(`
      SELECT description, qty, UOM, price 
      FROM quotation_items 
      WHERE quotation_id = ? 
      ORDER BY id ASC
    `).bind(id).all();

    // 批量插入清单项
    for (const it of items.results) {
      const q = Number(it.qty) || 0;
      const p = Number(it.price) || 0;
      const uom = it.UOM || ""; // 获取单位
      
      const isSection = it.description.startsWith("[") || (q === 0 && p === 0);
      
      let finalDesc = it.description;
      let finalStatus = 'NOT_STARTED';

      if (isSection) {
        // 如果是标题，进行加固美化
        finalDesc = "══ " + it.description.replace(/[\[\]]/g, "").toUpperCase() + " ══";
        finalStatus = 'SECTION'; 
      } else {
        // --- 核心改动：将 Qty 和 UOM 锁死在描述文本中 ---
        if (uom && q > 0) {
          finalDesc = `${it.description} [ ${q} ${uom} ]`;
        } else if (q > 0) {
          finalDesc = `${it.description} [ x${q} ]`;
        }
      }

      await env.DB.prepare(`
        INSERT INTO work_checklist_items (work_checklist_id, description, status, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `).bind(checklist_id, finalDesc, finalStatus).run();
    }
  } else {
    checklist_id = exists.id;
  }

  /* ===== 6. 返回结果 ===== */
  return Response.json({
    success: true,
    checklist_id: checklist_id,
    created_by: user.username,
    message: "Quotation accepted and checklist generated with UOM details"
  });
}
