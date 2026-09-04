"use client";

/**
 * Sidebar Navigation
 *
 * Text-only nav on the brand Ink rail, with active state and workspace section.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Overview", href: "/overview" },
  { label: "Inbox", href: "/inbox" },
  { label: "Campaigns", href: "/campaigns" },
  { label: "DM Logs", href: "/logs" },
  { label: "Settings", href: "/settings" },
  { label: "Diagnostics", href: "/diagnostics" },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceName: string;
}

export default function Sidebar({
  isOpen,
  onClose,
  workspaceName,
}: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-glass-ink lg:hidden"
          onClick={onClose}
        />
      )}

      {/* .glass-ink is affordable here because the rail is chrome: one element,
          never a repeating card, and on desktop it does not move. */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-dvh w-64 max-w-[85vw] shrink-0 glass-ink border-r border-border-invert flex flex-col
          transition-transform duration-200 ease-expressive
          lg:h-full lg:translate-x-0 lg:static lg:z-auto
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Same reason as the top bar: the drawer is full height, so the
            wordmark would otherwise land under the status bar. */}
        <div
          className="px-6 py-5 border-b border-border-invert"
          style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}
        >
          <Link
            href="/dashboard"
            className="font-title text-base font-semibold tracking-tight text-on-ink"
          >
            Startscalr
          </Link>
        </div>

        {/* Keyboard focus is the global :focus-visible copper ring from
            globals.css — nothing here overrides or removes it. */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={isActive ? "page" : undefined}
                className={`
                  relative block px-3 py-2.5 rounded-btn text-sm transition-colors duration-150 ease-standard
                  ${
                    isActive
                      ? "bg-ink-raised text-tan font-medium"
                      : "text-on-ink-soft hover:bg-ink-hover hover:text-on-ink"
                  }
                `}
              >
                {/* Copper reads as the signal at 2px wide; as body-size label
                    text on ink it would not clear contrast. */}
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-pill bg-accent"
                  />
                )}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-5 py-5 border-t border-border-invert">
          <p className="text-sm text-on-ink truncate">{workspaceName}</p>
          <p className="mt-0.5 text-xs uppercase tracking-wide text-on-ink-mute">
            Self-hosted
          </p>
        </div>
      </aside>
    </>
  );
}
