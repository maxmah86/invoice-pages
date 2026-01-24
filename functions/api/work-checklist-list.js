export async function onRequestGet({ request, env }) {

  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rows = await env.DB.prepare(`
    SELECT
      wc.id,
      wc.quotation_id,
      wc.created_at,
      COUNT(wci.id) AS total_items,
      SUM(CASE WHEN wci.status = 'DONE' THEN 1 ELSE 0 END) AS done_items
    FROM work_checklists wc
    LEFT JOIN work_checklist_items wci
      ON wci.work_checklist_id = wc.id
    GROUP BY wc.id
    ORDER BY wc.id DESC
  `).all();

  return Response.json({
    items: rows.results.map(r => ({
      id: r.id,
      quotation_id: r.quotation_id,
      created_at: r.created_at,
      total_items: r.total_items || 0,
      done_items: r.done_items || 0
    }))
  });
}
