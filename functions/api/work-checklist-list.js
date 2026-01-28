export async function onRequestGet({ request, env }) {

  /* ===== Auth (session_token) ===== */
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

  /* ===== Load checklist summary ===== */
  const rows = await env.DB.prepare(`
    SELECT
      wc.id,
      wc.quotation_id,
      wc.created_at,
      q.quotation_no,
      COUNT(wci.id) AS total_items,
      SUM(CASE WHEN wci.status = 'DONE' THEN 1 ELSE 0 END) AS done_items
    FROM work_checklists wc
    LEFT JOIN work_checklist_items wci
      ON wci.work_checklist_id = wc.id
    LEFT JOIN quotations q
      ON q.id = wc.quotation_id
    GROUP BY wc.id
    ORDER BY wc.id DESC
  `).all();

  return Response.json({
    items: rows.results.map(r => {
      const total = r.total_items || 0;
      const done = r.done_items || 0;
      const percent = total === 0 ? 0 : Math.round((done / total) * 100);

      return {
        id: r.id,
        quotation_id: r.quotation_id,
        quotation_no: r.quotation_no,
        created_at: r.created_at,
        total_items: total,
        done_items: done,
        progress_percent: percent
      };
    })
  });
}
