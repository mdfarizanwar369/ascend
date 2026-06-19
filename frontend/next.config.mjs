/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@ascend/shared"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" }
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
