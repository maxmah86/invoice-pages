/**
 * API: /api/project-delete (POST)
 * 权限控制: 仅限 Admin 使用
 * 作用: 彻底级联删除指定项目及其包含的所有关联内容 (Invoices, Quotations, VOs, POs 等)
 */

export async function onRequestPost({ request, env }) {
  const db = env.DB;

  try {
    /* ── 1. Auth Check ── */
    const cookie = request.headers.get("Cookie") || "";
    const token = cookie.match(/session=([^;]+)/)?.[1];

    if (!token) return jsonError("Unauthorized", 401);

    const user = await db.prepare(`
      SELECT id, username, role FROM users WHERE session_token = ?
    `).bind(token).first();

    if (!user) return jsonError("Unauthorized", 401);

    /* ── 2. Admin 权限硬性拦截 ── */
    const role = (user.role || "").toString().trim().toLowerCase();
    if (role !== "admin") {
      return jsonError("Access denied. Only administrators can perform project deletions.", 403);
    }

    /* ── 3. Parse Body ── */
    const { id } = await request.json();
    if (!id) return jsonError("Project ID is required", 400);

    /* ── 4. Project Check ── */
    const project = await db.prepare(`
      SELECT id FROM projects WHERE id = ?
    `).bind(id).first();

    if (!project) return jsonError("Project not found", 404);

    /* ── 5. Cascade Delete Operations ── */
    // 使用 D1 batch 进行原子事务批量删除项目及其所有关联记录
    await db.batch([
      db.prepare("DELETE FROM invoices WHERE project_id = ?").bind(id),
      db.prepare("DELETE FROM quotations WHERE project_id = ?").bind(id),
      db.prepare("DELETE FROM variation_orders WHERE project_id = ?").bind(id),
      db.prepare("DELETE FROM purchase_orders WHERE project_id = ?").bind(id),
      db.prepare("DELETE FROM purchase_invoices WHERE project_id = ?").bind(id),
      db.prepare("DELETE FROM daily_labours WHERE project_id = ?").bind(id),
      db.prepare("DELETE FROM expenses WHERE project_id = ?").bind(id),
      db.prepare("DELETE FROM projects WHERE id = ?").bind(id)
    ]);

    return new Response(
      JSON.stringify({ success: true, message: "Project and all associated data deleted successfully." }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return jsonError("Delete failed: " + err.message, 500);
  }
}

function jsonError(message, status = 400) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
