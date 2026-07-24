/**
 * API: /api/project-detail (GET)
 * 功能: 获取项目详情及关联的所有财务单据，计算财务总览
 * 权限规则:
 *   - Admin: 可查看所有项目
 *   - Moderator / User: 仅可查看自己创建的项目 (project.created_by === user.id)
 */

export async function onRequestGet({ request, env }) {
  const db = env.DB;

  try {
    /* ── 1. Auth 检查 ── */
    const cookie = request.headers.get("Cookie") || "";
    const token = cookie.match(/session=([^;]+)/)?.[1];

    if (!token) {
      return jsonError("Unauthorized", 401);
    }

    const user = await db.prepare(`
      SELECT id, username, role FROM users WHERE session_token = ?
    `).bind(token).first();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    /* ── 2. Project ID 校验 ── */
    const url = new URL(request.url);
    const idStr = url.searchParams.get("id");
    const projectId = Number(idStr);

    if (!idStr || isNaN(projectId) || projectId <= 0) {
      return jsonError("Valid Project ID is required", 400);
    }

    /* ── 3. Fetch project ── */
    const project = await db.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();

    if (!project) {
      return jsonError("Project not found", 404);
    }

    /* ── 4. 权限隔离控制（更新：Moderator 只能看自己的项目） ── */
    const userRole = (user.role || "").toLowerCase().trim();
    const isAdmin = userRole === "admin";
    
    // 强制转为字符串安全对比，防范数据类型差异
    const projectOwnerId = String(project.created_by ?? "").trim();
    const currentUserId  = String(user.id ?? "").trim();
    const isOwner        = projectOwnerId !== "" && projectOwnerId === currentUserId;

    // 非 Admin 且 非项目创建者，统一拦截 403
    if (!isAdmin && !isOwner) {
      return jsonError("Forbidden: You do not have permission to view this project", 403);
    }

    /* ── 5. 安全并行查询所有关联单据 (Promise.all 提升效率) ── */
    const [
      quotationsRes,
      invoicesRes,
      poRes,
      piRes,
      voRes,
      laboursRes,
      expensesRes
    ] = await Promise.all([
      db.prepare(`
        SELECT id, quotation_no, customer, project_title, grand_total, status, created_at
        FROM quotations WHERE project_id = ? ORDER BY created_at DESC
      `).bind(projectId).all(),

      db.prepare(`
        SELECT id, invoice_no, customer, amount, status, created_at
        FROM invoices
        WHERE project_id = ? AND (status IS NULL OR status != 'VOID')
        ORDER BY created_at DESC
      `).bind(projectId).all(),

      db.prepare(`
        SELECT id, po_no, po_date, supplier_name, total, status, created_at
        FROM purchase_orders WHERE project_id = ? ORDER BY created_at DESC
      `).bind(projectId).all(),

      // 兜底查询防崩溃
      db.prepare(`
        SELECT id, pi_no, subcon_name, claim_date, net_amount, status, created_at
        FROM purchase_invoices WHERE project_id = ? ORDER BY created_at DESC
      `).bind(projectId).all().catch(() => ({ results: [] })),

      db.prepare(`
        SELECT id, vo_no, title, amount, status, created_at
        FROM variation_orders WHERE project_id = ? ORDER BY created_at DESC
      `).bind(projectId).all().catch(() => ({ results: [] })),

      db.prepare(`
        SELECT id, slip_no, labour_date, worker_name, job, amount, status
        FROM daily_labours WHERE project_id = ? ORDER BY labour_date DESC
      `).bind(projectId).all().catch(() => ({ results: [] })),

      db.prepare(`
        SELECT id, expense_no, expense_date, category, description, vendor, amount, status
        FROM expenses WHERE project_id = ? ORDER BY expense_date DESC
      `).bind(projectId).all().catch(() => ({ results: [] }))
    ]);

    // 提取结果集并防范 null
    const quotations = quotationsRes?.results || [];
    const invoices = invoicesRes?.results || [];
    const purchase_orders = poRes?.results || [];
    const purchase_invoices = piRes?.results || [];
    const variation_orders = voRes?.results || [];
    const daily_labours = laboursRes?.results || [];
    const expenses = expensesRes?.results || [];

    /* ── 6. 财务数据计算 ── */
    const totalInvoiced = invoices.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const totalCollected = invoices
      .filter(i => (i.status || "").toUpperCase() === "PAID")
      .reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const totalOutstanding = totalInvoiced - totalCollected;

    const totalPO = purchase_orders.reduce((s, p) => s + (Number(p.total) || 0), 0);
    const totalPI = purchase_invoices.reduce((s, p) => s + (Number(p.net_amount) || 0), 0);
    const totalLabour = daily_labours.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const totalExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    // 仅计算已批准 (APPROVED) 的 Variation Orders
    const totalVO = variation_orders
      .filter(v => (v.status || "").toUpperCase() === "APPROVED")
      .reduce((s, v) => s + (Number(v.amount) || 0), 0);

    // 总成本 Total Cost = PO + PI + Labour + Expenses
    const totalCost = totalPO + totalPI + totalLabour + totalExpenses;

    // 毛利 Gross Profit = Invoiced - Total Cost
    const grossProfit = totalInvoiced - totalCost;

    /* ── 7. 返回结果 ── */
    return new Response(
      JSON.stringify({
        success: true,
        project,
        financials: {
          contract_value: Number(project.contract_value) || 0,
          total_invoiced: totalInvoiced,
          total_collected: totalCollected,
          total_outstanding: totalOutstanding,
          total_po: totalPO,
          total_purchase_invoices: totalPI,
          total_vo: totalVO,
          total_labour: totalLabour,
          total_expenses: totalExpenses,
          total_cost: totalCost,
          gross_profit: grossProfit
        },
        quotations,
        invoices,
        purchase_orders,
        purchase_invoices,
        variation_orders,
        daily_labours,
        expenses
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );

  } catch (err) {
    console.error("Fetch Project Detail Error:", err);
    return jsonError(err.message || "Internal Server Error", 500);
  }
}

/* ── 辅助响应函数 ── */
function jsonError(message, status = 400) {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
