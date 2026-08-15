import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  if (process.env.NEXT_PUBLIC_APP_ENV === "staging") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/demo", "/contact", "/privacy", "/terms", "/refund-policy", "/delete-account"],
      disallow: [
        "/admin",
        "/athlete",
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
