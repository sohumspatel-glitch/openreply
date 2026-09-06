"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The floating tab bar, phones only.
 *
 * Five destinations, not seven. The sidebar carries every route; this carries
 * the ones an operator opens between other things — the two that answer "is it
 * working" (Dashboard, Overview), the one they act in (Inbox), the one they
 * change (Campaigns), and the receipts (Logs). Settings and Diagnostics are
 * deliberate visits, and they stay in the drawer.
 *
 * It floats above the content rather than sitting in a docked bar, because the
 * frosted pane only reads as glass when there is something moving behind it.
 * A docked opaque bar would be cheaper to render and would say nothing.
 */

const TABS = [
  {
    href: "/dashboard",
    label: "Home",
    icon: (
      <>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5.5 9.5V20h13V9.5" />
      </>
    ),
  },
  {
    href: "/overview",
    label: "Posts",
    icon: (
      <>
        <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
      </>
    ),
  },
  {
    href: "/inbox",
    label: "Inbox",
    icon: (
      <>
        <path d="M3.5 12h4l1.5 2.5h6L16.5 12h4" />
        <path d="M4.8 5.5h14.4l1.3 6.5v5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2v-5z" />
      </>
    ),
  },
  {
    href: "/campaigns",
    label: "Campaigns",
    icon: (
      <>
        <path d="M3.5 9.5v5h3l6 4V5.5l-6 4z" />
        <path d="M17 8.5a5 5 0 0 1 0 7" />
      </>
    ),
  },
  {
    href: "/logs",
    label: "Logs",
    icon: (
      <>
        <path d="M5 3.5h9l5 5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" />
        <path d="M13.5 3.8V9h5.2" />
        <path d="M8 13.5h8M8 17h5" />
      </>
    ),
  },
];

export default function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="tabbar lg:hidden"
      // Sits above the home indicator on a notched phone, and flat on the
      // bottom edge everywhere else.
      style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="glass-pill flex items-center gap-0.5 rounded-pill p-1.5">
        {TABS.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              aria-label={tab.label}
              className={
                "relative flex h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 " +
                "rounded-pill px-2 motion-safe:transition-colors " +
                (active
                  ? "bg-surface text-accent-text shadow-hair"
                  : "text-muted active:text-foreground")
              }
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[18px] w-[18px]"
                aria-hidden="true"
              >
                {tab.icon}
              </svg>
              <span className="text-[10px] font-medium leading-none tracking-tight">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
