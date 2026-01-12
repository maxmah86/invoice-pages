export async function onRequest({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response(JSON.stringify({ error:"Unauthorized" }), { status:401 });
  }

  const url = new URL(request.url);
  const customer = url.searchParams.get("customer");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!customer) {
    return new Response(JSON.stringify({ error:"Customer required" }), { status:400 });
  }

  let sql = `
    SELECT invoice_no, created_at, amount, status
    FROM invoices
    WHERE customer = ?
  `;
  const binds = [customer];

  if (from) {
    sql += " AND date(created_at) >= date(?)";
    binds.push(from);
  }
  if (to) {
    sql += " AND date(created_at) <= date(?)";
    binds.push(to);
  }

  sql += " ORDER BY created_at ASC";

  const result = await env.DB.prepare(sql).bind(...binds).all();

  return new Response(
    JSON.stringify({ invoices: result.results }),
    { headers:{ "Content-Type":"application/json" } }
  );
}
