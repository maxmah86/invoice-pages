export async function onRequest({ request }) {
  const cookie = request.headers.get("Cookie") || "";

  if (!cookie.includes("session=ok")) {
    return new Response(
      JSON.stringify({ loggedIn: false }),
      { status: 401 }
    );
  }

  return new Response(
    JSON.stringify({ loggedIn: true }),
    { status: 200 }
  );
}
