export async function onRequestGet({ request, env }) {
  try {
    const auth = await fetch(new URL("/api/auth-check", request.url), {
      headers: { cookie: request.headers.get("cookie") || "" }
    });
    if (!auth.ok) return new Response("Unauthorized", { status: 401 });

    const url = new URL(request.url);
    const month = url.searchParams.get("month")
      || new Date().toISOString().slice(0,7);

    /* ===== Salary (PAID only) ===== */
    const salaryRow = await env.DB.prepare(`
      SELECT IFNULL(SUM(net_salary),0) AS total
      FROM salaries
      WHERE salary_month = ?
        AND status = 'PAID'
    `).bind(month).first();

    /* ===== PO ===== */
    const poRow = await env.DB.prepare(`
      SELECT IFNULL(SUM(total),0) AS total
      FROM purchase_orders
      WHERE substr(created_at,1,7)=?
    `).bind(month).first();

    /* ===== Invoice (auto detect amount column) ===== */
    const columns = await env.DB.prepare(`
      PRAGMA table_info(invoices)
    `).all();

    const names = columns.results.map(c => c.name);

    let amountColumn = null;
    if (names.includes("total")) amountColumn = "total";
    else if (names.includes("grand_total")) amountColumn = "grand_total";
    else if (names.includes("amount")) amountColumn = "amount";
    else if (names.includes("sub_total")) amountColumn = "sub_total";

    let invoiceTotal = 0;

    if (amountColumn) {
      const invRow = await env.DB.prepare(`
        SELECT IFNULL(SUM(${amountColumn}),0) AS total
        FROM invoices
        WHERE substr(created_at,1,7)=?
      `).bind(month).first();

      invoiceTotal = invRow.total;
    }

    const profit = invoiceTotal - salaryRow.total - poRow.total;

    return new Response(
      JSON.stringify({
        month,
        invoice: invoiceTotal,
        salary: salaryRow.total,
        po: poRow.total,
        profit
      }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "profit calculation error",
        detail: String(err)
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
}
