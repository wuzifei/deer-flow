import { NextRequest, NextResponse } from "next/server";

const GATEWAY_URL = process.env.DEER_FLOW_INTERNAL_GATEWAY_BASE_URL?.trim().replace(/\/+$/, "") || "http://127.0.0.1:8001";

/**
 * Detect the original protocol from the browser request.
 * TLS terminates at the reverse proxy (cpolar/frt), so nextUrl.protocol
 * is always "http". We infer the real protocol from browser headers.
 */
function detectProto(request: NextRequest): string {
  // x-forwarded-proto: https from outer proxy is authoritative
  const xfp = request.headers.get("x-forwarded-proto");
  if (xfp && xfp.split(",")[0].trim().toLowerCase() === "https") return "https";
  // Origin header (browser sets on cross-origin and some same-origin requests)
  const origin = request.headers.get("origin");
  if (origin?.startsWith("https://")) return "https";
  // Referer header — most reliable for same-origin HTTPS POST
  const referer = request.headers.get("referer");
  if (referer?.startsWith("https://")) return "https";
  return "http";
}

/**
 * Intercept API rewrites to inject proxy headers that gateway needs.
 *
 * Next.js built-in rewrites don't forward Origin/X-Forwarded-* headers.
 * This middleware replaces the rewrite for /api/* paths by manually proxying
 * to gateway with the necessary headers injected.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only intercept API paths under basePath
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // LangGraph SDK uses /api/langgraph/* but Gateway expects /api/*
  const targetPath = pathname.startsWith("/api/langgraph/")
    ? pathname.replace("/api/langgraph/", "/api/")
    : pathname;
  const target = new URL(targetPath + request.nextUrl.search, GATEWAY_URL);

  // Build headers, forwarding originals and injecting proxy info
  const browserHost = request.headers.get("host") || request.nextUrl.host;
  const proto = detectProto(request);
  const origin = request.headers.get("origin");

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("x-forwarded-proto", proto);
  headers.set("x-forwarded-host", browserHost);
  headers.set("x-original-host", browserHost);
  if (origin) {
    headers.set("x-forwarded-origin", origin);
  }

  return NextResponse.rewrite(target, { request: { headers } });
}

export const config = {
  matcher: ["/api/:path*"],
};
