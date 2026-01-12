export async function onRequestPost({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok"))
    return new Response("Unauthorized", { status: 401 });

  const { customer, items } = await request.json();
  if (!customer || !items?.length)
    return new Response("Invalid data", { status: 400 });

  const total = items.reduce((s, i) => s + i.qty * i.price, 0);

  // quotation no
  const d = new Date();
  const date = d.toISOString().slice(0,10).replace(/-/g,"");
  const cnt = await env.DB.prepare(
    "SELECT COUNT(*) c FROM quotations WHERE date(created_at)=date('now')"
  ).first();

  const no = `QT-${date}-${String(cnt.c + 1).padStart(4,"0")}`;

  const q = await env.DB.prepare(
    "INSERT INTO quotations (quotation_no, customer, amount) VALUES (?, ?, ?)"
  ).bind(no, customer, total).run();

  const qid = q.meta.last_row_id;

  for (const it of items) {
    await env.DB.prepare(
      "INSERT INTO quotation_items (quotation_id, description, qty, price) VALUES (?, ?, ?, ?)"
    ).bind(qid, it.description, it.qty, it.price).run();
  }

  return Response.json({ success: true, quotation_id: qid, quotation_no: no });
}
