export async function onRequestGet({ request, env }) {
  try {
    const auth = await fetch(new URL("/api/auth-check", request.url), {
      headers: { cookie: request.headers.get("cookie") || "" }
    });
    if (!auth.ok) return new Response("Unauthorized", { status: 401 });

    const url = new URL(request.url);
    const month = url.searchParams.get("month")
      || new Date().toISOString().slice(0,7);

    const columns = await env.DB.prepare(`
      PRAGMA table_info(invoices)
    `).all();

    const names = columns.results.map(c => c.name);

    let amountColumn = null;
    if (names.includes("total")) amountColumn = "total";
    else if (names.includes("grand_total")) amountColumn = "grand_total";
    else if (names.includes("amount")) amountColumn = "amount";
    else if (names.includes("sub_total")) amountColumn = "sub_total";

    if (!amountColumn) {
      return new Response(
        JSON.stringify({ month, total: 0, error: "no amount column found" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const row = await env.DB.prepare(`
      SELECT IFNULL(SUM(${amountColumn}), 0) AS total
      FROM invoices
      WHERE substr(created_at, 1, 7) = ?
    `).bind(month).first();

    return new Response(
      JSON.stringify({
        month,
        total: row.total,
        column_used: amountColumn
      }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({
        month: null,
        total: 0,
        error: "invoice dashboard error",
        detail: String(err)
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
}
