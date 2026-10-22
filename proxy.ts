import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 1. Bypass auth internal API routes (/api/auth/*)
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // 2. Detect session cookie from Better Auth
  const sessionToken =
    getSessionCookie(request) ||
    request.cookies.get("better-auth.session_token")?.value ||
    request.cookies.get("__Secure-better-auth.session_token")?.value;

  const isAuthenticated = !!sessionToken;
  const isAuthRoute = pathname.startsWith("/auth");

  // 3. When an authenticated user tries to visit /auth/login (or any /auth/* route),
  // redirect them directly to the root (/) route
  if (isAuthenticated && isAuthRoute) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // 4. When an unauthenticated user tries to visit any protected route beyond /auth/login,
  // redirect them to /auth/login
  if (!isAuthenticated && !isAuthRoute) {
    const loginUrl = new URL("/auth/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("callbackURL", `${pathname}${search}`);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export default proxy;

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Static assets (.svg, .png, .jpg, .jpeg, .gif, .webp, .ico)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
