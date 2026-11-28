import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/demo", "/contact", "/privacy", "/terms", "/refund-policy", "/delete-account"],
      disallow: [
        "/admin",
        "/athlete",
        "/challenges",
        "/coach",
        "/dashboard",
        "/founder",
        "/messages",
        "/onboarding",
        "/profile",
        "/login",
        "/launch",
        "/reset",
        "/subscription",
        "/bootstrap-owner",
        "/trainer"
      ]
    },
    sitemap: "https://www.getascend.fit/sitemap.xml"
  };
}
