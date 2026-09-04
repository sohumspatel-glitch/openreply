import Link from "next/link";

interface PublicSiteHeaderProps {
  active?: "home" | "templates";
}

const navLinks = [
  { label: "Templates", href: "/templates", key: "templates" },
  { label: "Agencies", href: "/instagram-dm-automation-agencies", key: "agencies" },
  { label: "Pricing", href: "/#pricing", key: "pricing" },
  { label: "Security", href: "/#security", key: "security" },
];

export default function PublicSiteHeader({ active }: PublicSiteHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border-invert bg-glass-ink-strong backdrop-blur-glass">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="OpenReply home">
          <span className="text-lg font-bold text-on-ink">OpenReply</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              className={`text-sm font-medium transition ${
                active === link.key ? "text-on-ink" : "text-on-ink-mute hover:text-on-ink"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden px-4 py-2 text-sm font-semibold text-on-ink-soft transition hover:text-on-ink sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-btn bg-tan px-4 py-2 text-sm font-bold text-ink transition hover:bg-accent"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}
