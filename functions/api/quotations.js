export async function onRequest({ request, env }) {

  const cookie = request.headers.get("Cookie") || "";
  const token = cookie.match(/session=([^;]+)/)?.[1];

  if (!token) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  const user = await env.DB.prepare(`
    SELECT id, role
    FROM users
    WHERE session_token = ?
  `).bind(token).first();

  if (!user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  const result = await env.DB.prepare(`
    SELECT
      id,
      quotation_no,
      customer,
      amount,
      status
    FROM quotations
    ORDER BY id DESC
  `).all();

  return new Response(
    JSON.stringify(result.results),
    {
      headers: { "Content-Type": "application/json" }
    }
  );
}
