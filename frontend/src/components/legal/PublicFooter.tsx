import Link from "next/link";

const links = [
  { href: "/privacy", label: "Privacy" },
  { href: "/delete-account", label: "Account deletion" },
  { href: "/terms", label: "Terms" },
  { href: "/refund-policy", label: "Refunds" },
  { href: "/contact", label: "Support" }
];

export function PublicFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={`${compact ? "mt-5" : "mt-auto border-t border-line py-6"} text-sm text-zinc-500`}>
      <div className={`flex ${compact ? "justify-center" : "flex-col justify-between gap-3 sm:flex-row sm:items-center"}`}>
        {!compact ? <p>&copy; 2026 Ascend. Train. Elevate. Become.</p> : null}
        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-2" aria-label="Legal and support">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="flex min-h-11 min-w-11 items-center justify-center transition-colors hover:text-calm">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
