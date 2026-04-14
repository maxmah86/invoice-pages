export async function onRequest({ request, env }) {
  // ... (前面的身份验证代码保持不变) ...

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return new Response(JSON.stringify({ success: false, error: "Missing ID" }), { status: 400 });

  try {
    // 1. 获取发票主表
    const invoice = await env.DB.prepare(`
      SELECT i.*, p.project_name FROM invoices i 
      LEFT JOIN projects p ON i.project_id = p.id WHERE i.id = ?
    `).bind(id).first();

    if (!invoice) return new Response(JSON.stringify({ success: false, error: "Not found" }), { status: 404 });

    // 2. 获取所有的 Section（分组）
    const sectionsRaw = await env.DB.prepare(`
      SELECT * FROM invoice_sections WHERE invoice_id = ? ORDER BY sort_order ASC
    `).bind(id).all();
    const sections = sectionsRaw.results || [];

    // 3. 获取所有的 Items（明细项）
    const itemsRaw = await env.DB.prepare(`
      SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC
    `).bind(id).all();
    const items = itemsRaw.results || [];

    // 4. 返回包含 sections 的数据结构
    return new Response(JSON.stringify({
      success: true,
      invoice,
      sections, // 新增：返回分组信息
      items     // 返回明细信息
    }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
}
