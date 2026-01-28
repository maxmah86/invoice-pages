export async function onRequest({ request }) {
  return new Response(
    JSON.stringify({
      cookie: request.headers.get("Cookie")
    }),
    { status: 200 }
  );
}
