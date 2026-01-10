export async function onRequest({ request }) {
  try {
    const token = request.headers.get("Authorization");
    const url = new URL(request.url);
    const qs = url.search;

    const res = await fetch(
      "https://invoice-api.myfong86.workers.dev/invoice" + qs,
      {
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
      JSON.stringify({ error: "invoice proxy error", detail: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}