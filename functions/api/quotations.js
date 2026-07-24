/**
 * 完整的 quotations.js API (Cloudflare Pages Functions / D1)
 * 路径: /api/quotations
 * 功能: 获取列表 (GET) + 删除记录 (DELETE)
 */

export async function onRequest(context) {
  const { request } = context;
  const method = request.method.toUpperCase();

  // 1. OPTIONS 预检请求处理 (预防跨域或预检拦截)
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Cookie",
      },
    });
  }

  // 2. 路由分发
  if (method === "GET") {
    return onRequestGet(context);
  } else if (method === "DELETE") {
    return onRequestDelete(context);
  }

  return jsonError("Method not allowed", 405);
}

/**
 * GET: 获取所有报价单列表
 */
async function onRequestGet(context) {
  const { request, env } = context;
  const db = env.DB;

  // 1. 权限检查：允许 Admin 和 Moderator 查看列表
  const auth = await requireAuth(request, ["admin", "moderator"]);
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
    console.error("GET Quotations Error:", err);
    return jsonError(err.message, 500);
  }
}

/**
 * DELETE: 删除报价单及其关联项（使用 D1 Batch 事务处理）
 */
async function onRequestDelete(context) {
  const { request, env } = context;
  const db = env.DB;

  // 1. 权限检查：允许 Admin 和 Moderator 删除报价单
  const auth = await requireAuth(request, ["admin", "moderator"]);
  if (!auth.ok) return auth.response;

  // 2. 获取 URL 参数中的 id (?id=xxx)
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id || isNaN(Number(id))) {
    return jsonError("Valid Quotation ID is required", 400);
  }

  try {
    // 3. 检查记录是否存在
    const existing = await db.prepare("SELECT id FROM quotations WHERE id = ?").bind(id).first();
    if (!existing) {
      return jsonError("Record not found", 404);
    }

    // 4. 使用 db.batch() 开启事务原子性删除，避免孤儿数据产生
    await db.batch([
      db.prepare("DELETE FROM quotation_items WHERE quotation_id = ?").bind(id),
      db.prepare("DELETE FROM quotation_sections WHERE quotation_id = ?").bind(id),
      db.prepare("DELETE FROM quotations WHERE id = ?").bind(id)
    ]);

    return jsonOK({ message: "Deleted successfully", id: Number(id) });
  } catch (err) {
    console.error("Delete Quotation Error:", err);
    return jsonError(err.message, 500);
  }
}

/* ================= HELPERS (辅助函数) ================= */

/**
 * 通用身份与角色鉴权函数
 * @param {Request} request 
 * @param {Array<string>} allowedRoles 允许访问的角色数组
 */
async function requireAuth(request, allowedRoles = ["admin"]) {
  try {
    // 转发 Cookie 至鉴权接口
    const res = await fetch(new URL("/api/auth-check", request.url), {
      headers: { Cookie: request.headers.get("Cookie") || "" }
    });

    if (!res.ok) {
      return { ok: false, response: jsonError("Authentication service error", 500) };
    }

    const auth = await res.json();

    if (!auth.loggedIn) {
      return { ok: false, response: jsonError("Not logged in", 401) };
    }

    const userRole = (auth.role || "").toString().trim().toLowerCase();
    const normalizedAllowedRoles = allowedRoles.map(r => r.toLowerCase());

    if (!normalizedAllowedRoles.includes(userRole)) {
      return { ok: false, response: jsonError("Permission denied", 403) };
    }

    return { ok: true, user: auth };
  } catch (err) {
    return { ok: false, response: jsonError("Auth verification failed", 500) };
  }
}

function jsonOK(data) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
