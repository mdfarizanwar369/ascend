export function MetricCard({
  label,
  value,
  detail,
  tone = "default"
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass = tone === "success" ? "text-lime" : tone === "warning" ? "text-amber" : "text-white";

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <p className="text-xs uppercase text-zinc-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
      <p className="mt-1 text-sm text-zinc-400">{detail}</p>
    </section>
  );
}
