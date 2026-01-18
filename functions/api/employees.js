export async function onRequestGet({ request, env }) {

  /* ===============================
     AUTH CHECK
     =============================== */
  const auth = await fetch(new URL("/api/auth-check", request.url), {
    headers: { cookie: request.headers.get("cookie") || "" }
  });

  if (!auth.ok) {
    return new Response("Unauthorized", { status: 401 });
  }

  /* ===============================
     QUERY EMPLOYEES
     =============================== */
  const { results } = await env.DB.prepare(`
    SELECT
      id,
      name,
      role,
      base_salary,
      status
    FROM employees
    ORDER BY status = 'ACTIVE' DESC, name
  `).all();

  return new Response(
    JSON.stringify(results),
    { headers: { "Content-Type": "application/json" } }
  );
}
