export async function onRequestGet({ request, env }) {

  /* ===== Auth (session_token) ===== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = await env.DB.prepare(`
    SELECT id, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (user.role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const month =
      url.searchParams.get("month") ||
      new Date().toISOString().slice(0, 7);

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

      invoiceTotal = Number(invRow.total || 0);
    }

    const salaryTotal = Number(salaryRow.total || 0);
    const poTotal = Number(poRow.total || 0);
    const profit = invoiceTotal - salaryTotal - poTotal;

    return Response.json({
      month,
      invoice: invoiceTotal,
      salary: salaryTotal,
      po: poTotal,
      profit
    });

  } catch (err) {
    return Response.json(
      {
        error: "profit calculation error",
        detail: String(err)
      },
      { status: 500 }
    );
  }
}
