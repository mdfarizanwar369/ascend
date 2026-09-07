"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/I18nProvider";

const links = [
  { href: "/privacy", key: "legal.footerPrivacy" },
  { href: "/delete-account", key: "legal.footerDelete" },
  { href: "/terms", key: "legal.footerTerms" },
  { href: "/refund-policy", key: "legal.footerRefunds" },
  { href: "/contact", key: "legal.footerSupport" }
];

export function PublicFooter({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <footer className={`${compact ? "mt-5" : "mt-auto border-t border-line py-6"} text-sm text-zinc-500`}>
      <div className={`flex ${compact ? "justify-center" : "flex-col justify-between gap-3 sm:flex-row sm:items-center"}`}>
        {!compact ? <p>&copy; 2026 Ascend. {t("legal.footerMotto")}</p> : null}
        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-2" aria-label={t("legal.footerAria")}>
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="flex min-h-11 min-w-11 items-center justify-center transition-colors hover:text-calm">
              {t(link.key)}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
