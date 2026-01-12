export async function onRequest({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok"))
    return new Response("Unauthorized", { status: 401 });

  const id = new URL(request.url).searchParams.get("id");

  const quotation = await env.DB.prepare(
    "SELECT * FROM quotations WHERE id=?"
  ).bind(id).first();

  const items = await env.DB.prepare(
    "SELECT * FROM quotation_items WHERE quotation_id=?"
  ).bind(id).all();

  return Response.json({ quotation, items: items.results });
}
