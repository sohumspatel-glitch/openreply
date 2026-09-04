import Link from "next/link";
import PublicSiteHeader from "@/components/public-site-header";

export interface SeoPageSection {
  title: string;
  body: string;
}

export interface SeoPageConfig {
  eyebrow: string;
  title: string;
  description: string;
  primaryCta: string;
  secondaryCta?: string;
  bullets: string[];
  sections: SeoPageSection[];
  comparisonTitle: string;
  comparisons: Array<{
    label: string;
    ours: string;
    other: string;
  }>;
  templateLinks: Array<{
    label: string;
    href: string;
  }>;
  faqs: SeoPageSection[];
}

export default function SeoPageShell({ config }: { config: SeoPageConfig }) {
  return (
    <main className="min-h-screen bg-ink text-on-ink">
      <PublicSiteHeader />

      <section className="border-b border-border-invert bg-ink-raised">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-20 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
          <div>
            <p className="text-sm font-bold uppercase text-tan">
              {config.eyebrow}
            </p>
            <h1 className="mt-4 text-5xl font-black leading-tight text-on-ink sm:text-6xl">
              {config.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-on-ink-soft">
              {config.description}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-btn bg-tan px-6 py-3 text-sm font-bold text-ink transition hover:bg-accent"
              >
                {config.primaryCta}
              </Link>
              <Link
                href="/templates"
                className="inline-flex items-center justify-center rounded-btn border border-border-invert bg-ink px-6 py-3 text-sm font-bold text-on-ink transition hover:bg-ink-hover"
              >
                {config.secondaryCta ?? "Browse templates"}
              </Link>
            </div>
          </div>

          <div className="border border-border-invert bg-ink p-6">
            <p className="text-xs font-bold uppercase tracking-wide text-on-ink-mute">
              Campaign OS checklist
            </p>
            <ul className="mt-5 space-y-4">
              {config.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-3 text-sm leading-6 text-on-ink-soft">
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {config.sections.map((section) => (
            <article key={section.title} className="border border-border-invert bg-ink-raised p-6">
              <h2 className="text-2xl font-black text-on-ink">{section.title}</h2>
              <p className="mt-4 text-sm leading-7 text-on-ink-soft">{section.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border-invert bg-ink-raised py-16">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-black text-on-ink">{config.comparisonTitle}</h2>
          <div className="mt-8 overflow-hidden border border-border-invert">
            <div className="hidden border-b border-border-invert bg-ink text-xs font-bold uppercase tracking-wide text-on-ink-mute md:grid md:grid-cols-[0.8fr_1fr_1fr]">
              <div className="p-4">Need</div>
              <div className="p-4 text-tan">OpenReply</div>
              <div className="p-4">Generic automation</div>
            </div>
            {config.comparisons.map((item) => (
              <div
                key={item.label}
                className="grid grid-cols-1 border-b border-border-invert last:border-0 md:grid-cols-[0.8fr_1fr_1fr]"
              >
                <div className="bg-ink p-4 text-sm font-semibold text-on-ink">
                  {item.label}
                </div>
                <div className="p-4 text-sm leading-6 text-on-ink-soft">
                  {item.ours}
                </div>
                <div className="p-4 text-sm leading-6 text-on-ink-mute">
                  {item.other}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div>
          <p className="text-sm font-bold uppercase text-tan">
            Start from a template
          </p>
          <h2 className="mt-3 text-4xl font-black text-on-ink">
            Launch a campaign faster than building a chatbot flow
          </h2>
          <p className="mt-5 text-sm leading-7 text-on-ink-soft">
            Use a campaign template, connect the right Instagram account, pick
            the post, and ship a measurable comment-to-DM loop.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {config.templateLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="border border-border-invert bg-ink-raised p-5 text-sm font-semibold text-on-ink transition hover:border-tan/40 hover:bg-tan/10"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="border-t border-border-invert bg-ink-raised py-16">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div>
            <p className="text-sm font-bold uppercase text-tan">FAQ</p>
            <h2 className="mt-3 text-4xl font-black text-on-ink">
              Search questions, answered clearly
            </h2>
          </div>
          <div className="grid gap-3">
            {config.faqs.map((faq) => (
              <article key={faq.title} className="border border-border-invert bg-ink p-5">
                <h3 className="text-lg font-bold text-on-ink">{faq.title}</h3>
                <p className="mt-2 text-sm leading-6 text-on-ink-soft">{faq.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-6 lg:px-8">
        <div className="border border-tan/20 bg-tan/10 p-8 text-center">
          <h2 className="text-4xl font-black text-on-ink">
            Turn the next high-intent comment into a private reply
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-on-ink-soft">
            OpenReply is built for Instagram professional accounts, official
            Meta private replies, and campaign reporting teams can show clients.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-flex items-center justify-center rounded-btn bg-tan px-6 py-3 text-sm font-bold text-ink transition hover:bg-accent"
          >
            Start free
          </Link>
        </div>
      </section>
    </main>
  );
}

