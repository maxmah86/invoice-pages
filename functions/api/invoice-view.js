export async function onRequest({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const user = await env.DB.prepare(`SELECT id, role FROM users WHERE session_token = ?`).bind(token).first();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 });

  try {
    // 1. 获取发票主表
    const invoice = await env.DB.prepare(`SELECT * FROM invoices WHERE id = ?`).bind(id).first();
    if (!invoice) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

    // 2. 获取所有项目 (使用 LEFT JOIN 确保没有 section_id 的旧项目也能出来)
    const itemsRaw = await env.DB.prepare(`
      SELECT i.*, s.section_title 
      FROM invoice_items i
      LEFT JOIN invoice_sections s ON i.section_id = s.id
      WHERE i.invoice_id = ?
      ORDER BY i.section_id ASC, i.sort_order ASC, i.id ASC
    `).bind(id).all();
    
    const items = itemsRaw.results || [];

    // 3. 数据重组：将项目按分段归类
    const sectionsMap = new Map();
    const noSectionItems = [];

    items.forEach(item => {
      if (item.section_id) {
        if (!sectionsMap.has(item.section_id)) {
          sectionsMap.set(item.section_id, {
            section_title: item.section_title || "Items",
            items: []
          });
        }
        sectionsMap.get(item.section_id).items.push(item);
      } else {
        // 旧单据项目，放入待处理队列
        noSectionItems.push(item);
      }
    });

    let finalSections = Array.from(sectionsMap.values());

    // 【关键】兼容旧单：如果有没有分段的项目，把它们封装成一个默认分段
    if (noSectionItems.length > 0) {
      finalSections.unshift({
        section_title: finalSections.length > 0 ? "General Items" : "", 
        items: noSectionItems
      });
    }

    return new Response(JSON.stringify({
      success: true,
      invoice: invoice,
      sections: finalSections
    }), { headers: { "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
