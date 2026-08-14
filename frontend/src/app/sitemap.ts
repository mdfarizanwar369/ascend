import type { MetadataRoute } from "next";

const publicRoutes = ["", "/demo", "/contact", "/privacy", "/terms", "/refund-policy", "/delete-account"];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return publicRoutes.map((route, index) => ({
    url: `https://www.getascend.fit${route}`,
    lastModified,
    changeFrequency: index === 0 ? "weekly" : "monthly",
    priority: index === 0 ? 1 : route === "/demo" ? 0.8 : 0.5
  }));
}
