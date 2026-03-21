export async function onRequestGet({ request, env }) {

  /* ── Auth ── */
  const cookie = request.headers.get("Cookie") || "";
  const token  = cookie.match(/session=([^;]+)/)?.[1];
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const user = await env.DB.prepare(
    `SELECT id, role FROM users WHERE session_token = ?`
  ).bind(token).first();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  /* ── Filters ── */
  const url        = new URL(request.url);
  const month      = url.searchParams.get("month");
  const category   = url.searchParams.get("category");
  const project_id = url.searchParams.get("project_id");
  const q          = url.searchParams.get("q");
  const status     = url.searchParams.get("status");

  let sql = `
    SELECT
      e.id, e.expense_no, e.expense_date, e.category,
      e.description, e.vendor, e.receipt_no, e.amount,
      e.payment_method, e.paid_by, e.project_id,
      e.notes, e.status, e.created_at,
      p.project_name
    FROM expenses e
    LEFT JOIN projects p ON p.id = e.project_id
    WHERE 1 = 1
  `;

  const params = [];

  if (month) {
    sql += " AND substr(e.expense_date, 1, 7) = ?";
    params.push(month);
  }
  if (category) {
    sql += " AND e.category = ?";
    params.push(category);
  }
  if (project_id) {
    sql += " AND e.project_id = ?";
    params.push(project_id);
  }
  if (status) {
    sql += " AND e.status = ?";
    params.push(status);
  }
  if (q) {
    sql += " AND (e.description LIKE ? OR e.vendor LIKE ? OR e.expense_no LIKE ?)";
    const kw = `%${q}%`;
    params.push(kw, kw, kw);
  }

  sql += " ORDER BY e.expense_date DESC, e.id DESC";

  try {
    const { results } = await env.DB.prepare(sql).bind(...params).all();

    /* Total for filtered results */
    const total = (results || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);

    return Response.json({ success: true, rows: results || [], total });
  } catch (err) {
    return Response.json({ error: "DB error: " + err.message }, { status: 500 });
  }
}
