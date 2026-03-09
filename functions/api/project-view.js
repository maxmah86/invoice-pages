export async function onRequestGet({ request, env }) {

  /* ===============================
     1. AUTH CHECK
     =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const user = await env.DB.prepare(`
    SELECT id, username, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     2. GET PROJECT ID
     =============================== */
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return new Response(
      JSON.stringify({ error: "Project ID required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     3. FETCH PROJECT
     =============================== */
  const project = await env.DB.prepare(`
    SELECT * FROM projects WHERE id = ?
  `).bind(id).first();

  if (!project) {
    return new Response(
      JSON.stringify({ error: "Project not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  /* ===============================
     4. FETCH RELATED DOCUMENTS
     =============================== */

  // Quotations
  const { results: quotations } = await env.DB.prepare(`
    SELECT id, quotation_no, customer, project_title,
           grand_total, status, created_at
    FROM quotations
    WHERE project_id = ?
    ORDER BY created_at DESC
  `).bind(id).all();

  // Invoices
  const { results: invoices } = await env.DB.prepare(`
    SELECT id, invoice_no, customer, amount, status, created_at
    FROM invoices
    WHERE project_id = ?
      AND (status IS NULL OR status != 'VOID')
    ORDER BY created_at DESC
  `).bind(id).all();

  // Purchase Orders
  const { results: purchase_orders } = await env.DB.prepare(`
    SELECT id, po_no, po_date, supplier_name, total, status, created_at
    FROM purchase_orders
    WHERE project_id = ?
    ORDER BY created_at DESC
  `).bind(id).all();

  // Variation Orders
  const { results: variation_orders } = await env.DB.prepare(`
    SELECT id, vo_no, title, amount, status, created_at
    FROM variation_orders
    WHERE project_id = ?
    ORDER BY created_at DESC
  `).bind(id).all();

  // Daily Labours
  const { results: daily_labours } = await env.DB.prepare(`
    SELECT id, slip_no, labour_date, worker_name, job, amount, status
    FROM daily_labours
    WHERE project_id = ?
    ORDER BY labour_date DESC
  `).bind(id).all();

  /* ===============================
     5. CALCULATE FINANCIALS (P&L)
     =============================== */

  // Total invoiced (non-void)
  const totalInvoiced = invoices.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

  // Total collected (PAID invoices)
  const totalCollected = invoices
    .filter(i => i.status === "PAID")
    .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

  // Outstanding
  const totalOutstanding = totalInvoiced - totalCollected;

  // Total PO cost
  const totalPO = purchase_orders.reduce((sum, p) => sum + (Number(p.total) || 0), 0);

  // Total VO (approved only)
  const totalVO = variation_orders
    .filter(v => v.status === "APPROVED")
    .reduce((sum, v) => sum + (Number(v.amount) || 0), 0);

  // Total daily labour
  const totalLabour = daily_labours.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  // Gross profit
  const grossProfit = totalInvoiced - totalPO - totalLabour;

  /* ===============================
     6. RESPONSE
     =============================== */
  return new Response(
    JSON.stringify({
      project,
      financials: {
        contract_value:   Number(project.contract_value) || 0,
        total_invoiced:   totalInvoiced,
        total_collected:  totalCollected,
        total_outstanding: totalOutstanding,
        total_po:         totalPO,
        total_vo:         totalVO,
        total_labour:     totalLabour,
        gross_profit:     grossProfit
      },
      quotations:      quotations      || [],
      invoices:        invoices        || [],
      purchase_orders: purchase_orders || [],
      variation_orders: variation_orders || [],
      daily_labours:   daily_labours   || []
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
