export async function onRequestPost() {
  return new Response(
    JSON.stringify({ success: true }),
    {
      headers: {
        "Content-Type": "application/json",
        // ⭐ 最小且安全的 cookie
        "Set-Cookie": "session=ok; Path=/; SameSite=Lax"
      }
    }
  );
}
