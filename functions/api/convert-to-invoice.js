// 在你的 Cloudflare Workers 后端添加
export async function onRequestPost({ request, env }) {
  const { quotation_id } = await request.json();

  // 1. 获取报价单主表
  const q = await env.DB.prepare("SELECT * FROM quotations WHERE id = ?").bind(quotation_id).first();
  
  // 生成新发票号码 (逻辑参考你的 invoice.js)
  const dateStr = new Date().toISOString().slice(2,10).replace(/-/g, "");
  const invoiceNo = `INV-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

  // 2. 插入发票主表
  const invResult = await env.DB.prepare(
    "INSERT INTO invoices (invoice_no, customer, amount, project_id, status, created_at) VALUES (?, ?, ?, ?, 'UNPAID', CURRENT_TIMESTAMP)"
  ).bind(invoiceNo, q.customer, q.grand_total, q.project_id).run();
  
  const invoiceId = invResult.meta.last_row_id;

  // 3. 复制分段和项目
  const sections = await env.DB.prepare("SELECT * FROM quotation_sections WHERE quotation_id = ?").bind(quotation_id).all();
  
  for (const sec of sections.results) {
    const secInv = await env.DB.prepare(
      "INSERT INTO invoice_sections (invoice_id, section_title, sort_order) VALUES (?, ?, ?)"
    ).bind(invoiceId, sec.section_title, sec.sort_order).run();
    
    const newSecId = secInv.meta.last_row_id;

    await env.DB.prepare(`
      INSERT INTO invoice_items (invoice_id, section_id, description, qty, price, UOM, sort_order)
      SELECT ?, ?, description, qty, unit_price, UOM, sort_order 
      FROM quotation_items WHERE section_id = ?
    `).bind(invoiceId, newSecId, sec.id).run();
  }

  return new Response(JSON.stringify({ success: true, invoice_no: invoiceNo }));
}

