export async function onRequest({ request, env }) {
  /* ===============================
     1. AUTH CHECK (管理员验证)
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const user = await env.DB.prepare(`
    SELECT id, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // 仅允许管理员访问（可根据需要调整为 user.role === "admin" 或包含其他角色）
  if (user.role !== "admin") {
    return new Response(
      JSON.stringify({ success: false, error: "Forbidden: Admin access required" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     2. 获取并验证 ID 参数
     =============================== */
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return new Response(
      JSON.stringify({ success: false, error: "Missing invoice ID" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     3. 查询发票数据
     =============================== */
  try {
    // 获取发票主表（关联项目名称）
    const invoice = await env.DB.prepare(`
      SELECT i.*, p.project_name
      FROM invoices i
      LEFT JOIN projects p ON i.project_id = p.id
      WHERE i.id = ?
    `).bind(id).first();

    if (!invoice) {
      return new Response(
        JSON.stringify({ success: false, error: "Invoice not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // 获取 Sections
    const sectionsRaw = await env.DB.prepare(`
      SELECT * FROM invoice_sections WHERE invoice_id = ? ORDER BY sort_order ASC
    `).bind(id).all();
    const sections = sectionsRaw.results || [];

    // 获取 Items
    const itemsRaw = await env.DB.prepare(`
      SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC
    `).bind(id).all();
    const items = itemsRaw.results || [];

    // 返回完整数据
    return new Response(
      JSON.stringify({
        success: true,
        invoice,
        sections,
        items
      }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Invoice View Error:", err.message);
    return new Response(
      JSON.stringify({ success: false, error: "Database error: " + err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}