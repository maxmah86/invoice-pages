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
  const result = await env.DB.prepare(`
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
      created_at
    FROM daily_labours
    ORDER BY labour_date DESC, id DESC
  `).all();

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
