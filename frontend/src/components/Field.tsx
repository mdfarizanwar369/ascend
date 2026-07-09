export function Field({
  label,
  children,
  hint
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-zinc-200">{label}</span>
      <span className="mt-2 block">{children}</span>
      {hint ? <span className="mt-1 block text-xs leading-5 text-zinc-500">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "ascend-field h-12 w-full rounded-lg border px-3 outline-none focus:border-lime";

export const selectClass =
  "ascend-field ascend-select h-12 w-full rounded-lg border px-3 pr-10 outline-none focus:border-lime";
