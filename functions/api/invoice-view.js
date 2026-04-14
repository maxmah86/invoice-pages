// functions/api/invoice-view.js

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) return jsonError("Invoice ID required", 400);

  try {
    // 1. 获取发票主表信息 (增加了项目名称、地址、折扣等字段)
    const invoice = await db.prepare(`
      SELECT id, invoice_no, customer, amount, status, project_id, 
             project_title, project_address, discount, created_at 
      FROM invoices WHERE id = ?
    `).bind(id).first();

    if (!invoice) return jsonError("Invoice not found", 404);

    // 2. 获取所有分段
    const sections = await db.prepare(`
      SELECT * FROM invoice_sections WHERE invoice_id = ? ORDER BY sort_order ASC
    `).bind(id).all();

    // 3. 获取所有项目明细
    const items = await db.prepare(`
      SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY section_id, sort_order ASC
    `).bind(id).all();

    // 4. 将项目归类到对应的分段中 (逻辑同 Quotation)
    const sectionMap = {};
    sections.results.forEach(sec => {
      sectionMap[sec.id] = { ...sec, items: [] };
    });

    items.results.forEach(it => {
      if (it.section_id && sectionMap[it.section_id]) {
        sectionMap[it.section_id].items.push(it);
      }
    });

    return jsonOK({
      invoice,
      sections: Object.values(sectionMap)
    });

  } catch (err) {
    return jsonError(err.message, 500);
  }
}

function jsonOK(data) { return new Response(JSON.stringify({ success: true, ...data }), { headers: { "Content-Type": "application/json" } }); }
function jsonError(msg, status) { return new Response(JSON.stringify({ success: false, error: msg }), { status, headers: { "Content-Type": "application/json" } }); }
