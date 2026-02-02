export async function onRequest(context) {
  const { request, env } = context;

  // 可选：简单保护（不需要可删）
  // if (request.headers.get('x-admin-key') !== env.ADMIN_KEY) {
  //   return new Response('Unauthorized', { status: 401 });
  // }

  const sql = `
    SELECT name, sql
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `;

  const { results } = await env.DB.prepare(sql).all();

  const output = results
    .map(row => row.sql + ';')
    .join('\n\n');

  return new Response(output, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
}
