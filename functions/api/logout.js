export async function onRequestPost({ request }) {
  try {
    const token = request.headers.get("Authorization");

    const res = await fetch(
      "https://invoice-api.myfong86.workers.dev/logout",
      {
        method: "POST",
        headers: { Authorization: token || "" }
      }
    );

    const text = await res.text();

    return new Response(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" }
    });

  } catch (e) {
    return new Response(
      JSON.stringify({ error: "logout proxy error", detail: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}