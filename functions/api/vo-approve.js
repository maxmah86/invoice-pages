export async function onRequestPost({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id, action, approved_by } = await request.json();

  if (!id || !["APPROVE", "REJECT"].includes(action)) {
    return new Response("Invalid data", { status: 400 });
  }

  const vo = await env.DB.prepare(`
    SELECT status
    FROM variation_orders
    WHERE id = ?
  `).bind(id).first();

  if (!vo || vo.status !== "DRAFT") {
    return new Response("VO not editable", { status: 400 });
  }

  const status = action === "APPROVE" ? "APPROVED" : "REJECTED";

  await env.DB.prepare(`
    UPDATE variation_orders
    SET status = ?, approved_at = datetime('now'), approved_by = ?
    WHERE id = ?
  `).bind(
    status,
    approved_by || "SYSTEM",
    id
  ).run();

  return Response.json({ success: true, status });
}
