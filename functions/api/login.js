export async function onRequestPost({ request }) {
  const body = await request.json();
  const { username, password } = body;

  // demo 登录（你之后可以接 DB）
  if (username === "admin" && password === "admin123") {
    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": "session=valid; Path=/; HttpOnly; SameSite=Lax"
        }
      }
    );
  }

  return new Response(
    JSON.stringify({ success: false }),
    { status: 401 }
  );
}
