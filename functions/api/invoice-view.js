export async function onRequest({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return new Response(
      JSON.stringify({ error: "Missing id" }),
      { status: 400 }
    );
  }

  // 1️⃣ 读取 invoice
  const invoice = await env.DB.prepare(
    "SELECT id, customer, amount, status, created_at FROM invoices WHERE id=?"
  ).bind(id).first();

  if (!invoice) {
    return new Response(
      JSON.stringify({ error: "Not found" }),
      { status: 404 }
    );
  }

  // 2️⃣ 读取 items
  const items = await env.DB.prepare(
    "SELECT id, invoice_no, customer, amount, status, created_at
FROM invoices
WHERE id=?"
  ).bind(id).all();

  return new Response(
    JSON.stringify({
      invoice,
      items: items.results
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
