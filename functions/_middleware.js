export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // 1️⃣ 放行 login 页面
  if (path === "/login.html") return context.next();

  // 2️⃣ 放行 API（API 不做 redirect）
  if (path.startsWith("/api/")) return context.next();

  // 3️⃣ 放行静态资源
  if (
    path.endsWith(".js") ||
    path.endsWith(".css") ||
    path.endsWith(".png") ||
    path.endsWith(".jpg")
  ) {
    return context.next();
  }

  // 4️⃣ 页面才检查 cookie
  const cookie = request.headers.get("Cookie") || "";
  const loggedIn = cookie.includes("session=valid");

  if (!loggedIn) {
    return Response.redirect(new URL("/login.html", request.url), 302);
  }

  return context.next();
}
