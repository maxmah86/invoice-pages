export async function onRequestGet({ request, env }) {

  /* ===============================
     AUTH CHECK (SYSTEM STANDARD)
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
     GET ID
     =============================== */
  const id = new URL(request.url).searchParams.get("id");

  if (!id) {
    return new Response(
      JSON.stringify({ error: "Missing id" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  /* ===============================
     QUERY DAILY LABOUR
     =============================== */
  const labour = await env.DB.prepare(`
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
      notes,
      void_reason,
      status,
      created_at
    FROM daily_labours
    WHERE id = ?
  `).bind(id).first();

  if (!labour) {
    return new Response(
      JSON.stringify({ error: "Daily labour not found" }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  /* ===============================
     RESPONSE
     =============================== */
  return new Response(
    JSON.stringify(labour),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );
}
