"use client";

export interface AccountOption {
  id: string;
  username: string;
  instagramId: string;
  name?: string | null;
}

interface AccountSelectProps {
  accounts: AccountOption[];
  value: string;
  onChange: (value: string) => void;
  includeAll?: boolean;
  label?: string;
}

export default function AccountSelect({
  accounts,
  value,
  onChange,
  includeAll = true,
  label = "Instagram account",
}: AccountSelectProps) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-faint">
        {label}
      </span>
      {/* The native chevron is kept: replacing it means an appearance-none field
          plus a background-image arrow, which cannot take a theme token. */}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-52 rounded-btn border border-border-firm bg-surface-field px-3 py-2 text-sm text-foreground shadow-hair transition-colors hover:border-accent/40 focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      >
        {includeAll && <option value="all">All accounts</option>}
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            @{account.username}
          </option>
        ))}
      </select>
    </label>
  );
}
