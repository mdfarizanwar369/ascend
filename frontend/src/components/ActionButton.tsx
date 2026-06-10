export function ActionButton({
  children,
  variant = "primary"
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  const className =
    variant === "primary"
      ? "flex h-12 w-full items-center justify-center rounded-lg bg-lime px-4 font-semibold text-ink"
      : "flex h-12 w-full items-center justify-center rounded-lg border border-line bg-surface px-4 font-semibold text-white";

  return <button className={className}>{children}</button>;
}

