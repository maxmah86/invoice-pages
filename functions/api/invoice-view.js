export async function onRequest({ request, env }) {
  /* ===============================
     AUTH CHECK
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const user = await env.DB.prepare(`SELECT id, username, role FROM users WHERE session_token = ?`).bind(token).first();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  /* ===============================
     READ DATA
     =============================== */
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 });

  // 获取发票主表
  const invoice = await env.DB.prepare(`
    SELECT id, invoice_no, customer, amount, status, project_id, created_at 
    FROM invoices WHERE id = ?
  `).bind(id).first();

  if (!invoice) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  // 获取明细表
  const itemsRaw = await env.DB.prepare(`
    SELECT description, qty, price FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC
  `).bind(id).all();
  
  const items = itemsRaw.results || [];

  // 后端预计算总数（可选，用于双重校验）
  const calculatedTotal = items.reduce((sum, item) => sum + (Number(item.qty) * Number(item.price)), 0);

  return new Response(
    JSON.stringify({
      invoice,
      items,
      calculatedTotal,
      viewer: { id: user.id, role: user.role }
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
