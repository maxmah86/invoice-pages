export async function onRequestPost({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const user = await env.DB.prepare(`SELECT id, role FROM users WHERE session_token = ?`).bind(token).first();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin", "staff"].includes(user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { id } = body;
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const vo = await env.DB.prepare(`SELECT status FROM variation_orders WHERE id = ?`).bind(id).first();
  if (!vo) return Response.json({ error: "VO not found" }, { status: 404 });
  if (vo.status !== "DRAFT") return Response.json({ error: "Only DRAFT VO can be deleted" }, { status: 400 });

  try {
    // 先删除关联的子项，再删除主表记录
    await env.DB.prepare(`DELETE FROM variation_order_items WHERE variation_order_id = ?`).bind(id).run();
    await env.DB.prepare(`DELETE FROM variation_orders WHERE id = ?`).bind(id).run();

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: "Database error: " + err.message }, { status: 500 });
  }
}
