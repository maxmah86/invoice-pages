export async function onRequestGet({ request, env }) {

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS purchase_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pi_no TEXT UNIQUE NOT NULL,
      project_id INTEGER,
      subcon_name TEXT NOT NULL,
      claim_date TEXT NOT NULL,
      net_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  /* ── Auth ── */
  const cookie = request.headers.get("Cookie") || "";
  const token  = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const user = await env.DB.prepare(`
    SELECT id, username, role FROM users WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  /* ── Project ID ── */
  const url = new URL(request.url);
  const id  = url.searchParams.get("id");

  if (!id) {
    return new Response(JSON.stringify({ error: "Project ID required" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  /* ── Fetch project ── */
  const project = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(id).first();

  if (!project) {
    return new Response(JSON.stringify({ error: "Project not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }

  /* ── Fetch all related documents ── */
  const { results: quotations } = await env.DB.prepare(`
    SELECT id, quotation_no, customer, project_title, grand_total, status, created_at
    FROM quotations WHERE project_id = ? ORDER BY created_at DESC
  `).bind(id).all();

  const { results: invoices } = await env.DB.prepare(`
    SELECT id, invoice_no, customer, amount, status, created_at
    FROM invoices
    WHERE project_id = ? AND (status IS NULL OR status != 'VOID')
    ORDER BY created_at DESC
  `).bind(id).all();

  const { results: purchase_orders } = await env.DB.prepare(`
    SELECT id, po_no, po_date, supplier_name, total, status, created_at
    FROM purchase_orders WHERE project_id = ? ORDER BY created_at DESC
  `).bind(id).all();

  const { results: purchase_invoices } = await env.DB.prepare(`
    SELECT id, pi_no, subcon_name, claim_date, net_amount, status, created_at
    FROM purchase_invoices WHERE project_id = ? ORDER BY created_at DESC
  `).bind(id).all();

  const { results: variation_orders } = await env.DB.prepare(`
    SELECT id, vo_no, title, amount, status, created_at
    FROM variation_orders WHERE project_id = ? ORDER BY created_at DESC
  `).bind(id).all();

  const { results: daily_labours } = await env.DB.prepare(`
    SELECT id, slip_no, labour_date, worker_name, job, amount, status
    FROM daily_labours WHERE project_id = ? ORDER BY labour_date DESC
  `).bind(id).all();

  /* ── Fetch expenses ── */
  const { results: expenses } = await env.DB.prepare(`
    SELECT id, expense_no, expense_date, category, description, vendor, amount, status
    FROM expenses WHERE project_id = ? ORDER BY expense_date DESC
  `).bind(id).all();

  /* ── Calculate financials ── */
  const totalInvoiced   = invoices.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalCollected  = invoices.filter(i => i.status === "PAID").reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalOutstanding = totalInvoiced - totalCollected;

  const totalPO     = purchase_orders.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const totalPI     = purchase_invoices.reduce((s, p) => s + (Number(p.net_amount) || 0), 0);
  const totalLabour = daily_labours.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // Approved VOs only
  const totalVO = variation_orders
    .filter(v => v.status === "APPROVED")
    .reduce((s, v) => s + (Number(v.amount) || 0), 0);

  // Total cost = PO + Labour + Expenses
  const totalCost = totalPO + totalPI + totalLabour + totalExpenses;

  // Gross profit = Invoiced - all costs
  const grossProfit = totalInvoiced - totalCost;

  return new Response(
    JSON.stringify({
      project,
      financials: {
        contract_value:    Number(project.contract_value) || 0,
        total_invoiced:    totalInvoiced,
        total_collected:   totalCollected,
        total_outstanding: totalOutstanding,
        total_po:          totalPO,
        total_purchase_invoices: totalPI,
        total_vo:          totalVO,
        total_labour:      totalLabour,
        total_expenses:    totalExpenses,
        total_cost:        totalCost,
        gross_profit:      grossProfit
      },
      quotations,
      invoices,
      purchase_orders,
      purchase_invoices,
      variation_orders,
      daily_labours,
      expenses
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
