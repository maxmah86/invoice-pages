export async function onRequestPost({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";

  if (!cookie.includes("session=ok")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400 }
    );
  }

  const { customer, amount } = data;

  if (!customer || typeof amount !== "number") {
    return new Response(
      JSON.stringify({ error: "Invalid data" }),
      { status: 400 }
    );
  }

  const result = await env.DB.prepare(
    "INSERT INTO invoices (customer, amount, created_at) VALUES (?, ?, datetime('now'))"
  ).bind(customer, amount).run();

  return new Response(
    JSON.stringify({
      success: true,
      invoice_id: result.meta.last_row_id
    }),
    {
      headers: { "Content-Type": "application/json" }
    }
  );
}
