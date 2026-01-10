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

  const { id, status } = data;
  if (!id || !["PAID", "UNPAID"].includes(status)) {
    return new Response(
      JSON.stringify({ error: "Invalid data" }),
      { status: 400 }
    );
  }

  await env.DB.prepare(
    "UPDATE invoices SET status=? WHERE id=?"
  ).bind(status, id).run();

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { "Content-Type": "application/json" } }
  );
}
