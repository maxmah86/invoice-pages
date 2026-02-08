/**
 * 完整的 quotations.js API
 * 路径: /api/quotations
 * 功能: 获取列表 (GET) + 删除记录 (DELETE)
 */

export async function onRequest(context) {
  const { request } = context;
  const method = request.method.toUpperCase();

  if (method === "GET") {
    return onRequestGet(context);
  } else if (method === "DELETE") {
    return onRequestDelete(context);
  }

  return jsonError("Method not allowed", 405);
}

/**
 * GET: 获取所有报价单
 */
async function onRequestGet(context) {
  const { request, env } = context;
  const db = env.DB;

  // 1. 权限检查
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const rows = await db.prepare(`
      SELECT
        id,
        quotation_no,
        customer,
        project_title,
        status,
        grand_total,
        created_at
      FROM quotations
      ORDER BY created_at DESC
    `).all();

    return jsonOK({
      list: rows.results || []
    });
  } catch (err) {
    return jsonError(err.message, 500);
  }
}

/**
 * DELETE: 删除报价单及其关联项
 */
async function onRequestDelete(context) {
  const { request, env } = context;
  const db = env.DB;

  // 1. 权限检查
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  // 2. 获取 URL 参数中的 id (?id=xxx)
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return jsonError("Quotation ID is required", 400);
  }

  try {
    // 3. 执行删除
    // 为了防止孤儿数据，建议按顺序删除关联表内容
    await db.prepare("DELETE FROM quotation_items WHERE quotation_id = ?").bind(id).run();
    await db.prepare("DELETE FROM quotation_sections WHERE quotation_id = ?").bind(id).run();
    const result = await db.prepare("DELETE FROM quotations WHERE id = ?").bind(id).run();

    if (result.meta.changes === 0) {
      return jsonError("Record not found", 404);
    }

    return jsonOK({ message: "Deleted successfully" });
  } catch (err) {
    console.error("Delete Error:", err);
    return jsonError(err.message, 500);
  }
}

/* ================= HELPERS (辅助函数) ================= */

async function requireAdmin(request) {
  // 这里的路径根据你的实际认证接口调整
  const res = await fetch(new URL('/api/auth-check', request.url), {
    headers: { Cookie: request.headers.get('Cookie') || '' }
  });

  const auth = await res.json();

  if (!auth.loggedIn) {
    return { ok: false, response: jsonError('Not logged in', 401) };
  }

  if (auth.role !== 'admin') {
    return { ok: false, response: jsonError('Permission denied', 403) };
  }

  return { ok: true, user: auth };
}

function jsonOK(data) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
