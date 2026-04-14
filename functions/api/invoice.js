/**
 * API: /api/invoice (POST)
 * 功能：创建升级版发票，支持分段(Sections)和单位(UOM)，结构与报价单完全统一
 */
export async function onRequestPost({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];
  
  if (!token) return jsonError("Unauthorized", 401);

  const user = await env.DB.prepare(`SELECT id, role FROM users WHERE session_token = ?`).bind(token).first();
  if (!user || user.role !== "admin") return jsonError("Forbidden", 403);

  try {
    const data = await request.json();
    const { 
      project_id, 
      customer, 
      invoice_date, 
      sections = [], 
      discount = 0,
      project_title,
      project_address
    } = data;

    // 1. 基础验证
    if (!customer) return jsonError("Customer name is required", 400);
    if (sections.length === 0) return jsonError("At least one section with items is required", 400);

    // 2. 生成发票单号 (INV-YYMMDD-XXXX)
    const targetDate = invoice_date || new Date().toISOString().slice(0, 10);
    const datePart = targetDate.replace(/-/g, "").slice(2, 8); // 取 260414
    const prefix = `INV-${datePart}-`;

    const maxRow = await env.DB.prepare(
      `SELECT MAX(invoice_no) AS max_no FROM invoices WHERE invoice_no LIKE ?`
    ).bind(prefix + "%").first();
    
    let seq = 1;
    if (maxRow?.max_no) {
      seq = parseInt(maxRow.max_no.slice(-4), 10) + 1;
    }
    const invoiceNo = `${prefix}${String(seq).padStart(4, "0")}`;

    // 3. 计算金额
    let subtotal = 0;
    sections.forEach(sec => {
      sec.items.forEach(it => {
        subtotal += Number(it.qty || 0) * Number(it.price || 0);
      });
    });
    const grandTotal = Math.max(0, subtotal - Number(discount));

    // 4. 准备 Batch 数据库操作
    const statements = [];

    // A. 插入发票主表
    statements.push(
      env.DB.prepare(`
        INSERT INTO invoices (
          invoice_no, customer, amount, status, project_id, 
          project_title, project_address, discount, created_at
        ) VALUES (?, ?, ?, 'UNPAID', ?, ?, ?, ?, ?)
      `).bind(
        invoiceNo, 
        customer, 
        grandTotal, 
        project_id || null,
        project_title || null,
        project_address || null,
        discount,
        targetDate + " 00:00:00"
      )
    );

    // 获取即将生成的 Invoice ID 的预备逻辑 (D1 batch 中需特殊处理或先插入)
    // 注意：在 D1 Batch 中由于无法直接拿到上一步的 ID，建议先执行主表插入获取 ID
    const invResult = await statements[0].run();
    const invoiceId = invResult.meta.last_row_id;
    
    const itemStatements = [];

    // B. 循环处理分段和项目
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      
      // 插入分段
      const secResult = await env.DB.prepare(`
        INSERT INTO invoice_sections (invoice_id, section_title, sort_order)
        VALUES (?, ?, ?)
      `).bind(invoiceId, sec.section_title, i).run();
      
      const sectionId = secResult.meta.last_row_id;

      // 插入该分段下的项目
      for (let j = 0; j < sec.items.length; j++) {
        const it = sec.items[j];
        itemStatements.push(
          env.DB.prepare(`
            INSERT INTO invoice_items (
              invoice_id, section_id, description, UOM, qty, price, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            invoiceId,
            sectionId,
            it.description,
            it.UOM || "",
            Number(it.qty) || 0,
            Number(it.price) || 0,
            j
          )
        );
      }
    }

    // 执行所有项目的插入
    if (itemStatements.length > 0) {
      await env.DB.batch(itemStatements);
    }

    return jsonOK({ 
      id: invoiceId, 
      invoice_no: invoiceNo 
    });

  } catch (err) {
    console.error("Invoice Create Error:", err);
    return jsonError(err.message || "Failed to create invoice", 500);
  }
}

// 辅助函数
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
