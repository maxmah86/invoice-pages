export async function onRequestGet({ request, env }) {

  /* ===============================
     AUTH CHECK — ALIGN WITH SYSTEM
     =============================== */
  const authRes = await fetch(
    new URL("/api/auth-check", request.url),
    {
      headers: {
        cookie: request.headers.get("cookie") || ""
      }
    }
  );

  if (!authRes.ok) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );
  }

  /* ===============================
     SAFETY CHECK
     =============================== */
  if (!env.DB) {
    return new Response(
      JSON.stringify({ error: "DB not bound" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  /* ===============================
     QUERY DAILY LABOURS
     =============================== */
  const url = new URL(request.url);
  const project_id = url.searchParams.get("project_id");

  let sql = `
    SELECT
      id,
      slip_no,
      labour_date,
      worker_name,
      job,
      amount,
      payment_method,
      paid_by,
      paid_at,
      status,
      project_id,
      created_at
    FROM daily_labours
    WHERE 1 = 1
  `;

  const params = [];

  if (project_id) {
    sql += " AND project_id = ?";
    params.push(project_id);
  }

  sql += " ORDER BY labour_date DESC, id DESC";

  const result = await env.DB.prepare(sql).bind(...params).all();

  /* ===============================
     RESPONSE (JSON ONLY)
     =============================== */
  return new Response(
    JSON.stringify(result.results || []),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );
}
