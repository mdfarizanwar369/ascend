import { fileURLToPath } from "node:url";

const isDevelopment = process.env.NODE_ENV !== "production";
const northflankBuild = process.env.ASCEND_NORTHFLANK_BUILD === "true";
const apiProxyOrigin = process.env.ASCEND_API_PROXY_ORIGIN?.replace(/\/+$/, "");
if (apiProxyOrigin) {
  const proxy = new URL(apiProxyOrigin);
  if (!["http:", "https:"].includes(proxy.protocol) || proxy.username || proxy.password || proxy.search || proxy.hash || proxy.pathname !== "/") {
    throw new Error("ASCEND_API_PROXY_ORIGIN must be an HTTP(S) origin without credentials, query, or path");
  }
}
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // Firebase's browser Google sign-in loads its iframe API from this origin.
  `script-src 'self' 'unsafe-inline' https://apis.google.com${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com",
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  ...(isDevelopment ? [] : ["upgrade-insecure-requests"])
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(northflankBuild ? {
    output: "standalone",
    outputFileTracingRoot: fileURLToPath(new URL("../", import.meta.url))
  } : {}),
  transpilePackages: ["@ascend/shared"],
  poweredByHeader: false,
  async rewrites() {
    return [
      ...(apiProxyOrigin ? [{
        source: "/api/v1/:path*",
        destination: `${apiProxyOrigin}/api/v1/:path*`
      }] : []),
      {
        source: "/__/auth/:path*",
        destination: "https://ascend-b2850.firebaseapp.com/__/auth/:path*"
      },
      {
        source: "/__/firebase/:path*",
        destination: "https://ascend-b2850.firebaseapp.com/__/firebase/:path*"
      }
    ];
  },
  async headers() {
    return [
      {
        source: "/:path((?!__).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy }
        ]
      },
      {
        source: "/__/auth/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }
        ]
      },
      {
        source: "/__/firebase/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }
        ]
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate"
          }
        ]
      },
      {
        source: "/exercise-visuals/ascend-original-v1/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
      },
      {
        source: "/exercise-visuals/ascend-original-v2/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
      },
      {
        source: "/exercise-visuals/ascend-original-v3/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
      },
      {
        source: "/exercise-visuals/ascend-original-v4/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
      },
      {
        source: "/exercise-visuals/ascend-original-v5/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
      },
      {
        source: "/exercise-visuals/ascend-original-v6/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
      },
      {
        source: "/dashboard",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store"
          }
        ]
      },
      {
        source: "/reset",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
