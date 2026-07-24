/**
 * API: /api/projects-list (GET)
 * 权限规则：
 * - admin: 检索全量项目
 * - moderator / standard user: 只能检索 p.created_by = user.id 的项目
 */

export async function onRequestGet({ request, env }) {
  const db = env.DB;

  try {
    /* ===============================
       1. AUTH CHECK
       =============================== */
    const cookie = request.headers.get("Cookie") || "";
    const token = cookie.match(/session=([^;]+)/)?.[1];

    if (!token) {
      return jsonError("Unauthorized", 401);
    }

    const user = await db.prepare(`
      SELECT id, username, role
      FROM users
      WHERE session_token = ?
    `).bind(token).first();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    /* ===============================
       2. OPTIONAL FILTERS
       =============================== */
    const url = new URL(request.url);
    const status      = url.searchParams.get("status");
    const q           = url.searchParams.get("q");
    const start_year  = url.searchParams.get("start_year");
    const start_month = url.searchParams.get("start_month");

    let sql = `
      SELECT
        p.id,
        p.project_no,
        p.project_name,
        p.client_name,
        p.project_type,
        p.contract_value,
        p.start_date,
        p.status,
        p.notes,
        p.created_by,
        p.created_at,

        -- Invoice summary
        IFNULL((
          SELECT SUM(amount)
          FROM invoices
          WHERE project_id = p.id
            AND (status IS NULL OR UPPER(status) != 'VOID')
        ), 0) AS total_invoiced,

        IFNULL((
          SELECT SUM(amount)
          FROM invoices
          WHERE project_id = p.id
            AND UPPER(status) = 'PAID'
        ), 0) AS total_collected,

        -- Cost summary
        IFNULL((
          SELECT SUM(total)
          FROM purchase_orders
          WHERE project_id = p.id
            AND (status IS NULL OR UPPER(status) != 'VOID')
        ), 0) AS total_po,

        IFNULL((
          SELECT SUM(net_amount)
          FROM purchase_invoices
          WHERE project_id = p.id
            AND (status IS NULL OR UPPER(status) != 'VOID')
        ), 0) AS total_purchase_invoices,

        IFNULL((
          SELECT SUM(amount)
          FROM daily_labours
          WHERE project_id = p.id
            AND (status IS NULL OR UPPER(status) != 'VOID')
        ), 0) AS total_labour,

        IFNULL((
          SELECT SUM(amount)
          FROM expenses
          WHERE project_id = p.id
            AND (status IS NULL OR UPPER(status) != 'VOID')
        ), 0) AS total_expenses

      FROM projects p
      WHERE 1 = 1
    `;

    const params = [];

    /* ===============================
       3. 核心：严格数据隔离
       =============================== */
    const userRole = (user.role || "").toString().trim().toLowerCase();
    
    // 只有 admin 可以查看全局项目
    // moderator 和普通用户均强制限制：只能看自己创建的项目
    if (userRole !== "admin") {
      sql += " AND p.created_by = ?";
      params.push(user.id);
    }

    if (status) {
      sql += " AND UPPER(p.status) = UPPER(?)";
      params.push(status);
    }

    if (start_month) {
      sql += " AND substr(p.start_date, 1, 7) = ?";
      params.push(start_month);
    } else if (start_year) {
      sql += " AND substr(p.start_date, 1, 4) = ?";
      params.push(start_year);
    }

    if (q) {
      sql += " AND (p.project_name LIKE ? OR p.client_name LIKE ? OR p.project_no LIKE ?)";
      const kw = `%${q.trim()}%`;
      params.push(kw, kw, kw);
    }

    sql += " ORDER BY p.created_at DESC";

    /* ===============================
       4. QUERY EXECUTION
       =============================== */
    const queryStmt = db.prepare(sql);
    const { results } = params.length > 0 
      ? await queryStmt.bind(...params).all() 
      : await queryStmt.all();

    return new Response(
      JSON.stringify(results || []),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return jsonError("Database error: " + err.message, 500);
  }
}

function jsonError(message, status = 400) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
