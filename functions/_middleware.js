export async function onRequest({ request, next }) {
  const url = new URL(request.url);

  if (url.pathname === "/login") return next();
  if (url.pathname.startsWith("/api/")) return next();

  const cookie = request.headers.get("Cookie") || "";
  if (!cookie.includes("session=ok")) {
    return Response.redirect(`${url.origin}/login`, 302);
  }

  return next();
}
