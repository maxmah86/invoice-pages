export async function onRequestPost({ request, env }) {
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const user = await env.DB.prepare(`SELECT id, role FROM users WHERE session_token = ?`).bind(token).first();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin", "staff"].includes(user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { id, title, reason, notes, items } = body;
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  if (!title || !title.trim()) return Response.json({ error: "Title is required" }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0) return Response.json({ error: "At least one item is required" }, { status: 400 });

  const vo = await env.DB.prepare(`SELECT id FROM variation_orders WHERE id = ?`).bind(id).first();
  if (!vo) return Response.json({ error: "VO not found" }, { status: 404 });

  let amount = 0;
  for (const i of items) amount += (Number(i.qty) || 0) * (Number(i.unit_price) || 0);
  if (amount <= 0) return Response.json({ error: "Total amount must be greater than 0" }, { status: 400 });

  try {
    await env.DB.prepare(`UPDATE variation_orders SET title = ?, reason = ?, notes = ?, amount = ? WHERE id = ?`)
      .bind(title.trim(), reason || "", notes || "", amount, id).run();

    await env.DB.prepare(`DELETE FROM variation_order_items WHERE variation_order_id = ?`).bind(id).run();
    const stmt = env.DB.prepare(`INSERT INTO variation_order_items (variation_order_id, description, qty, unit_price, line_total) VALUES (?, ?, ?, ?, ?)`);
    for (const i of items) {
      const qty = Number(i.qty) || 0;
      const price = Number(i.unit_price) || 0;
      await stmt.bind(id, i.description || "", qty, price, qty * price).run();
    }

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: "Database error: " + err.message }, { status: 500 });
  }
}
