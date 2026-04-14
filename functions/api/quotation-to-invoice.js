export async function onRequestPost({ request, env }) {
  const db = env.DB;

  /* ===============================
     1. 管理员验证 (保持你的安全逻辑)
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];
  if (!token) return jsonError("Unauthorized", 401);

  const user = await db.prepare(`SELECT id, role FROM users WHERE session_token = ?`).bind(token).first();
  if (!user || user.role !== "admin") return jsonError("Forbidden", 403);

  try {
    const { quotation_id } = await request.json();
    if (!quotation_id) return jsonError("Missing quotation_id", 400);

    /* ===============================
       2. 获取原始报价单数据
       =============================== */
    const q = await db.prepare(`SELECT * FROM quotations WHERE id = ?`).bind(quotation_id).first();
    if (!q) return jsonError("Quotation not found", 404);

    // 生成发票编号 (INV-YYMMDD-XXXX)
    const today = new Date().toISOString().slice(0, 10);
    const datePart = today.replace(/-/g, "").slice(2, 8); // "260414"
    const prefix = `INV-${datePart}-`;
    const maxRow = await db.prepare(`SELECT MAX(invoice_no) as maxNo FROM invoices WHERE invoice_no LIKE ?`).bind(prefix + "%").first();
    let seq = 1;
    if (maxRow?.maxNo) seq = parseInt(maxRow.maxNo.slice(-4)) + 1;
    const invoice_no = prefix + String(seq).padStart(4, "0");

    /* ===============================
       3. 核心转换逻辑 (Transaction-like)
       =============================== */
    
    // A. 插入发票主表
    // 继承 Quotation 的客户、金额、项目ID、折扣等信息
    const invRes = await db.prepare(`
      INSERT INTO invoices (
        invoice_no, customer, amount, status, project_id, quotation_id, created_at
      ) VALUES (?, ?, ?, 'UNPAID', ?, ?, datetime('now'))
    `).bind(
      invoice_no, 
      q.customer, 
      q.grand_total, 
      q.project_id || null, 
      quotation_id
    ).run();

    const newInvoiceId = invRes.meta.last_row_id;

    // B. 获取所有报价单分段
    const qSections = await db.prepare(`SELECT * FROM quotation_sections WHERE quotation_id = ? ORDER BY sort_order ASC`).bind(quotation_id).all();

    for (const sec of qSections.results) {
      // 1. 复制分段到 invoice_sections
      const secRes = await db.prepare(`
        INSERT INTO invoice_sections (invoice_id, section_title, sort_order)
        VALUES (?, ?, ?)
      `).bind(newInvoiceId, sec.section_title, sec.sort_order).run();
      
      const newSecId = secRes.meta.last_row_id;

      // 2. 获取该分段下的所有 items 并复制到 invoice_items
      const qItems = await db.prepare(`SELECT * FROM quotation_items WHERE quotation_id = ? AND section_id = ?`).bind(quotation_id, sec.id).all();
      
      for (const item of qItems.results) {
        await db.prepare(`
          INSERT INTO invoice_items (
            invoice_id, description, qty, price, UOM, section_id, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          newInvoiceId,
          item.description,
          item.qty,
          item.unit_price, // 注意：Quotation 里叫 unit_price, Invoice 里叫 price
          item.UOM,
          newSecId,
          item.sort_order
        ).run();
      }
    }

    // C. 处理没有分段的散装 items (如果有旧数据的话)
    const looseItems = await db.prepare(`SELECT * FROM quotation_items WHERE quotation_id = ? AND section_id IS NULL`).bind(quotation_id).all();
    for (const item of looseItems.results) {
      await db.prepare(`
        INSERT INTO invoice_items (invoice_id, description, qty, price, UOM, section_id, sort_order)
        VALUES (?, ?, ?, ?, ?, NULL, ?)
      `).bind(newInvoiceId, item.description, item.qty, item.unit_price, item.UOM, item.sort_order).run();
    }

    return jsonOK({ invoice_id: newInvoiceId, invoice_no });

  } catch (err) {
    console.error("Convert Error:", err);
    return jsonError(err.message, 500);
  }
}

// 辅助函数
function jsonOK(data) {
  return new Response(JSON.stringify({ success: true, ...data }), {
    headers: { "Content-Type": "application/json" }
  });
}

function jsonError(msg, status = 400) {
  return new Response(JSON.stringify({ success: false, error: msg }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
