export async function onRequest() {
  return new Response(null, {
    status: 302,
    headers: {
      "Set-Cookie": "session=; Path=/; Max-Age=0",
      "Location": "/login.html"
    }
  });
}
