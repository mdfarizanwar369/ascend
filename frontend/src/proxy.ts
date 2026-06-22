import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase().split(":")[0];

  if (host === "getascend.fit") {
    const url = request.nextUrl.clone();
    url.hostname = "www.getascend.fit";
    url.port = "";
    url.protocol = "https";
    return NextResponse.redirect(url, 308);
  }

  if (host === "demo.getascend.fit" && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/demo";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
