export type DashboardPanelLaunch = {
  panel: "recovery";
  cleanedPath: string;
};

export function consumeDashboardPanelLaunch(url: URL): DashboardPanelLaunch | null {
  if (url.searchParams.get("panel") !== "recovery") return null;

  const cleanedUrl = new URL(url);
  cleanedUrl.searchParams.delete("panel");
  if (cleanedUrl.searchParams.get("source") === "widget") {
    cleanedUrl.searchParams.delete("source");
  }

  return {
    panel: "recovery",
    cleanedPath: `${cleanedUrl.pathname}${cleanedUrl.search}${cleanedUrl.hash}`
  };
}
