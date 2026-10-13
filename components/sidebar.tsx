"use client";

/**
 * Sidebar Navigation
 *
 * Text-only nav on the brand Ink rail, with active state and workspace section.
 */

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BRANDS, type BrandKey } from "@/lib/branding";

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
  workspaceId: string;
  workspaceName: string;
  brandKey: BrandKey;
  workspaces: Array<{ id: string; name: string }>;
}

export default function Sidebar({
  isOpen,
  onClose,
  workspaceId,
  workspaceName,
  brandKey,
  workspaces,
}: SidebarProps) {
  const pathname = usePathname();
  const brand = BRANDS[brandKey];
  const [switching, setSwitching] = useState(false);

  async function switchWorkspace(nextId: string) {
    if (nextId === workspaceId) return;
    setSwitching(true);
    const res = await fetch("/api/workspace/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: nextId }),
    }).catch(() => null);
    if (!res?.ok) {
      setSwitching(false);
      return;
    }
    // The tab-session caches (post library, inbox selection) are keyed by
    // account, and none of the previous workspace's accounts exist in the next
    // one. A full navigation drops every client state along with them.
    try {
      window.sessionStorage.clear();
    } catch {
      // Storage unavailable: nothing cached to clear.
    }
    window.location.assign("/dashboard");
  }

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
      {/* data-brand scopes a brand accent onto the rail's active state only
          (see .glass-ink[data-brand] in globals.css). Absent for the default
          brand, so that look is exactly what it always was. */}
      <aside
        data-brand={brand.accent ? brand.key : undefined}
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
          {brand.iconSrc ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2.5 font-title text-base font-semibold tracking-tight text-on-ink"
            >
              {/* The mark is white on black, so a hairline ring keeps its
                  edge visible against the dark rail in both themes. */}
              <Image
                src={brand.iconSrc}
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 rounded-md ring-1 ring-white/15"
                priority
              />
              {brand.name}
            </Link>
          ) : (
            <Link
              href="/dashboard"
              className="font-title text-base font-semibold tracking-tight text-on-ink"
            >
              {brand.name}
            </Link>
          )}
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
          {workspaces.length > 1 ? (
            <label className="block">
              <span className="sr-only">Switch workspace</span>
              <select
                value={workspaceId}
                disabled={switching}
                onChange={(event) => void switchWorkspace(event.target.value)}
                className="w-full truncate rounded-btn border border-border-invert bg-ink-raised px-2 py-1.5 text-sm text-on-ink transition-colors hover:bg-ink-hover disabled:opacity-60"
              >
                {workspaces.map((workspace) => (
                  // The open list is drawn by the OS on the page palette, not
                  // on the rail, so on-ink text would vanish on a light popup.
                  <option
                    key={workspace.id}
                    value={workspace.id}
                    className="bg-background text-foreground"
                  >
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-sm text-on-ink truncate">{workspaceName}</p>
          )}
          <p className="mt-0.5 text-xs uppercase tracking-wide text-on-ink-mute">
            Self-hosted
          </p>
        </div>
      </aside>
    </>
  );
}
