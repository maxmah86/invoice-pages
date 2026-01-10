export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  const pathname = url.pathname;

  // ===== 1️⃣ 明确放行的路径（非常重要）=====
  if (
    pathname === "/login" ||
    pathname === "/login.html" ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/logout") ||
    pathname.startsWith("/api/health")
  ) {
    return next();
  }

  // ===== 2️⃣ 只保护 HTML 页面，不保护 API =====
  if (pathname.startsWith("/api/")) {
    return next();
  }

  // ===== 3️⃣ 检查登录 Cookie =====
  const cookie = request.headers.get("Cookie") || "";
  const loggedIn = cookie.includes("session=valid");

  if (!loggedIn) {
    // ⚠️ 只 redirect 非 login 页面
    return Response.redirect(
      new URL("/login.html", request.url),
      302
    );
  }

  // ===== 4️⃣ 已登录，放行 =====
  return next();
}
