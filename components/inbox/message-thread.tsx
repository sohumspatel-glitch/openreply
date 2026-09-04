"use client";

/**
 * An Instagram DM thread, rendered the way it looks on a phone.
 *
 * This is deliberately NOT on the Startscalr palette. It is a faithful replica
 * of someone else's product — the same exception the campaign preview takes —
 * because the whole point is to see what the recipient sees. Automated messages
 * are the reason: every template we send (the follow-gate button, the reveal
 * link, the follow-up card) comes back from the API with an EMPTY message body
 * and its real content inside `attachments`. Rendering only the text turned an
 * automated conversation into a column of blank bubbles.
 *
 * Instagram's own DM colours, sampled from iOS:
 *   thread   #000000      outbound  purple → blue gradient
 *   inbound  #262626      card      #262626 with hairline-separated CTAs
 */

import type { ThreadMessage } from "@/app/api/instagram/conversations/[id]/route";

const INBOUND = "#262626";
const CARD_DIVIDER = "rgba(255,255,255,0.12)";

function timeOf(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function dayOf(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

/**
 * A generic template as Instagram draws it: optional image, bold title, muted
 * subtitle, then full-width tappable CTAs separated by hairlines.
 */
function TemplateCard({
  title,
  subtitle,
  imageUrl,
  buttons,
}: {
  title: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  buttons: { title: string; url: string | null }[];
}) {
  return (
    <div
      className="w-[260px] overflow-hidden rounded-2xl"
      style={{ background: INBOUND }}
    >
      {imageUrl ? (
        // Meta re-hosts these on its own CDN and the URLs expire, so a broken
        // image is expected on old threads rather than a bug. next/image would
        // need every fbcdn subdomain in remotePatterns; a plain img does not.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className="block w-full object-cover"
        />
      ) : null}

      {title || subtitle ? (
        <div className="px-3.5 py-3">
          {title ? (
            <p className="text-[15px] font-semibold leading-snug text-white">
              {title}
            </p>
          ) : null}
          {subtitle ? (
            <p className="mt-1 text-[13px] leading-snug text-white/60">
              {subtitle}
            </p>
          ) : null}
        </div>
      ) : null}

      {buttons.map((button) =>
        button.url ? (
          <a
            key={button.title + button.url}
            href={button.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block border-t px-3 py-2.5 text-center text-[15px] font-semibold text-white motion-safe:transition-colors hover:bg-white/5"
            style={{ borderColor: CARD_DIVIDER }}
          >
            {button.title}
          </a>
        ) : (
          <div
            key={button.title}
            className="block border-t px-3 py-2.5 text-center text-[15px] font-semibold text-white/70"
            style={{ borderColor: CARD_DIVIDER }}
          >
            {button.title}
          </div>
        )
      )}
    </div>
  );
}

interface MessageThreadProps {
  messages: ThreadMessage[];
  loading: boolean;
}

export default function MessageThread({ messages, loading }: MessageThreadProps) {
  if (loading && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center bg-black">
        <p className="text-sm text-white/50">Loading…</p>
      </div>
    );
  }
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center bg-black">
        <p className="text-sm text-white/50">No messages.</p>
      </div>
    );
  }

  // Worked out up front rather than by mutating a counter inside the map:
  // reassigning during render is exactly the pattern React's rules forbid,
  // because a re-entrant render would read a stale value.
  const rows = messages.map((message, index) => {
    const day = dayOf(message.createdTime);
    return {
      message,
      day,
      showDay: index === 0 || day !== dayOf(messages[index - 1].createdTime),
    };
  });

  return (
    <div className="flex-1 space-y-1.5 bg-black px-4 py-4">
      {rows.map(({ message: m, day, showDay }) => {
        // A template message carries no text, so the card IS the bubble.
        const hasText = m.text.trim().length > 0;

        return (
          <div key={m.id}>
            {showDay && day ? (
              <p className="py-3 text-center text-[11px] font-medium uppercase tracking-wide text-white/40">
                {day}
              </p>
            ) : null}

            <div
              className={`flex flex-col gap-1 ${
                m.fromMe ? "items-end" : "items-start"
              }`}
            >
              {hasText ? (
                <div
                  className={`max-w-[75%] rounded-[18px] px-3.5 py-2 text-[15px] leading-snug text-white ${
                    m.fromMe ? "rounded-br-[6px]" : "rounded-bl-[6px]"
                  }`}
                  style={
                    m.fromMe
                      ? {
                          backgroundImage:
                            "linear-gradient(135deg,#A033FF 0%,#5B51D8 55%,#3797F0 100%)",
                        }
                      : { background: INBOUND }
                  }
                >
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                </div>
              ) : null}

              {m.attachments.map((a, index) =>
                a.kind === "template" ? (
                  <TemplateCard
                    key={m.id + ":" + index}
                    title={a.title}
                    subtitle={a.subtitle}
                    imageUrl={a.imageUrl}
                    buttons={a.buttons}
                  />
                ) : a.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={m.id + ":" + index}
                    src={a.imageUrl}
                    alt={a.title ?? ""}
                    loading="lazy"
                    className="max-w-[60%] rounded-2xl"
                  />
                ) : (
                  <div
                    key={m.id + ":" + index}
                    className="rounded-2xl px-3.5 py-2 text-[15px] text-white/70"
                    style={{ background: INBOUND }}
                  >
                    {a.title ?? "Attachment"}
                  </div>
                )
              )}

              {/* An attachment with no text and no renderable body still needs
                  to show as something, or the message silently disappears. */}
              {!hasText && m.attachments.length === 0 ? (
                <div
                  className="rounded-[18px] px-3.5 py-2 text-[15px] italic text-white/40"
                  style={{ background: INBOUND }}
                >
                  Unsupported message
                </div>
              ) : null}

              <p className="px-1 text-[11px] text-white/40">
                {timeOf(m.createdTime)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
