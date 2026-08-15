/** @type {import('next').NextConfig} */
const firebaseAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "ascend-b2850.firebaseapp.com";
const firebaseAuthOrigin = firebaseAuthDomain.startsWith("http://") || firebaseAuthDomain.startsWith("https://")
  ? firebaseAuthDomain
  : `https://${firebaseAuthDomain}`;

const nextConfig = {
  transpilePackages: ["@ascend/shared"],
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: "/__/auth/:path*",
        destination: `${firebaseAuthOrigin}/__/auth/:path*`
      },
      {
        source: "/__/firebase/:path*",
        destination: `${firebaseAuthOrigin}/__/firebase/:path*`
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
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" }
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
