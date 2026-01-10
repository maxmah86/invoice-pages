export async function onRequestPost({ request }) {
  const cookie = request.headers.get("Cookie") || "";

  // 只要 session=ok 才允许
  if (!cookie.includes("session=ok")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401 }
    );
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400 }
    );
  }

  // 原样返回，证明链路 OK
  return new Response(
    JSON.stringify({
      success: true,
      received: data
    }),
    {
      headers: { "Content-Type": "application/json" }
    }
  );
}
