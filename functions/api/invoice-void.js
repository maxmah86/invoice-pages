export async function onRequestPost({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { id, reason } = await request.json();

  if (!id) {
    return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 });
  }

  await env.DB.prepare(`
    UPDATE invoices
    SET status='VOID',
        voided_at=datetime('now'),
        void_reason=?
    WHERE id=? AND status!='VOID'
  `).bind(reason || "Voided", id).run();

  return new Response(JSON.stringify({ success: true }));
}
