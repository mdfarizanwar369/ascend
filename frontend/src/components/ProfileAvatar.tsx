import Image from "next/image";

const dimensions = {
  sm: "h-10 w-10 text-sm",
  md: "h-12 w-12 text-base",
  lg: "h-24 w-24 text-2xl"
};

function initials(name?: string | null) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!parts.length) return "A";
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts.at(-1)?.[0] ?? "" : ""}`.toUpperCase();
}

export function ProfileAvatar({
  src,
  name,
  size = "md"
}: {
  src?: string | null;
  name?: string | null;
  size?: keyof typeof dimensions;
}) {
  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-calm/15 font-semibold text-calm ${dimensions[size]}`}>
      {src ? (
        <Image src={src} alt={`${name ?? "Ascend user"} profile`} fill sizes={size === "lg" ? "96px" : size === "md" ? "48px" : "40px"} className="object-cover" unoptimized />
      ) : initials(name)}
    </span>
  );
}

