export async function onRequestPost({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];
  
  if (!token) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const user = await env.DB.prepare(`
      SELECT id, role
      FROM users
      WHERE session_token = ?
    `).bind(token).first();

    if (!user || user.role !== "admin") {
      return new Response(JSON.stringify({ success: false, error: user ? "Forbidden" : "Unauthorized" }), {
        status: user ? 403 : 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const data = await request.json();
    const { invoice_no, customer, project_id, amount, sections } = data;
    const cleanInvoiceNo = String(invoice_no || "").trim();
    const cleanCustomer = String(customer || "").trim();

    if (!cleanInvoiceNo || !cleanCustomer || !Array.isArray(sections) || sections.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "Invalid data" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const hasValidItem = sections.some((sec) =>
      Array.isArray(sec.items) &&
      sec.items.some((item) => String(item.description || "").trim() && Number.isFinite(Number(item.qty)) && Number.isFinite(Number(item.price)) && Number(item.qty) !== 0)
                                      );

    if (!hasValidItem) {
      return new Response(JSON.stringify({ success: false, error: "Invoice must include at least one valid item" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 1. 先插入发票主表并获取 ID
    const invResult = await env.DB.prepare(`
      INSERT INTO invoices (invoice_no, customer, project_id, amount, status, created_at)
      VALUES (?, ?, ?, ?, 'UNPAID', datetime('now'))
    `).bind(cleanInvoiceNo, cleanCustomer, project_id || null, Number(amount) || 0).run();

    const newInvoiceId = invResult.meta.last_row_id;

    // 2. 准备批量插入 Section 和 Items
    for (let secIdx = 0; secIdx < sections.length; secIdx++) {
      const sec = sections[secIdx];
      const sectionTitle = String(sec.title || "").trim() || `Section ${secIdx + 1}`;
      const items = Array.isArray(sec.items) ? sec.items : [];

      if (items.length === 0) continue;

      // 插入 Section
      const secResult = await env.DB.prepare(`
        INSERT INTO invoice_sections (invoice_id, section_title, sort_order)
        VALUES (?, ?, ?)
      `).bind(newInvoiceId, sectionTitle, Number(sec.sort_order) || secIdx).run();
      
      const newSectionId = secResult.meta.last_row_id;

      // 插入该 Section 下的所有 Items (使用 batch 提高性能)
      if (items.length > 0) {
        const itemStmts = items
          .filter((item) => String(item.description || "").trim() && Number(item.qty) > 0 && Number(item.price) >= 0)
          .map((item, idx) => {
          return env.DB.prepare(`
            INSERT INTO invoice_items (invoice_id, section_id, description, UOM, qty, price, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            newInvoiceId,
            newSectionId,
            String(item.description || "").trim(),
            String(item.UOM || "LOT").trim() || "LOT",
            Number(item.qty) || 0,
            Number(item.price) || 0,
            Number(item.sort_order) || idx
          );
        });

        if (itemStmts.length > 0) {
          await env.DB.batch(itemStmts);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, id: newInvoiceId }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("Save Error:", err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
