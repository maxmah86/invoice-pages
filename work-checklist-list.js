export async function onRequestGet({ request, env }) {

  /* ===============================
   * 1. Auth check
   * =============================== */
  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = await env.DB.prepare(`
    SELECT id, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  /* ===============================
   * 2. Read filter params
   * =============================== */
  const url = new URL(request.url);
  const project = url.searchParams.get("project"); // project title filter

  /* ===============================
   * 3. Query work checklists
   * =============================== */
  const sql = `
    SELECT
      wc.id,
      wc.quotation_id,
      wc.created_at,
      q.quotation_no,
      q.project_title,

      -- 只计算真正的工作项，排除 SECTION
      COUNT(
        CASE 
          WHEN wci.status != 'SECTION' THEN wci.id 
        END
      ) AS total_items,

      SUM(
        CASE 
          WHEN wci.status = 'DONE' THEN 1 
          ELSE 0 
        END
      ) AS done_items

    FROM work_checklists wc
    LEFT JOIN work_checklist_items wci
      ON wci.work_checklist_id = wc.id
    LEFT JOIN quotations q
      ON q.id = wc.quotation_id
    WHERE 1=1
      ${project ? "AND q.project_title LIKE ?" : ""}
    GROUP BY wc.id
    ORDER BY wc.id DESC
  `;

  const params = project ? [`%${project}%`] : [];

  const rows = await env.DB.prepare(sql)
    .bind(...params)
    .all();

  /* ===============================
   * 4. Format response
   * =============================== */
  const items = (rows.results || []).map(r => {
    const total = Number(r.total_items || 0);
    const done = Number(r.done_items || 0);
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);

    return {
      id: r.id,
      quotation_id: r.quotation_id,
      quotation_no: r.quotation_no,
      project_title: r.project_title,
      created_at: r.created_at,
      total_items: total,
      done_items: done,
      progress_percent: percent
    };
  });

  return Response.json({ items });
}
