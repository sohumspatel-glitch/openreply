/**
 * The sidebar has to be readable in both themes.
 *
 * Written after the dark sidebar shipped with near-black text on a near-black
 * panel. The cause was subtle and worth pinning: the `ink` family deliberately
 * FLIPS for dark mode, because its main job is "maximum contrast block" and a
 * primary button must become light on a dark canvas. But `.glass-ink` is a
 * translucent dark scrim in BOTH themes. Its background stayed dark while the
 * text token paired with it flipped to near-black, and nothing failed — it
 * just became unreadable.
 *
 * A screenshot caught it. This catches it next time, by reading the real
 * token values out of globals.css and compositing the real scrim.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");

/** Pull one custom property out of a specific rule block. */
function tokenIn(selector: string, name: string): string {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`selector not found: ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const body = css.slice(open, close);
  const match = body.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`${name} not found in ${selector}`);
  return match[1].trim();
}

type RGB = [number, number, number];

function hex(value: string): RGB {
  const m = value.replace("#", "");
  const full =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function rgba(value: string): { rgb: RGB; a: number } {
  const m = value.match(
    /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/
  );
  if (!m) throw new Error(`not an rgba value: ${value}`);
  return {
    rgb: [Number(m[1]), Number(m[2]), Number(m[3])],
    a: m[4] === undefined ? 1 : Number(m[4]),
  };
}

/** Source-over composite of a translucent layer on an opaque one. */
function composite(top: RGB, alpha: number, bottom: RGB): RGB {
  return top.map((c, i) => c * alpha + bottom[i] * (1 - alpha)) as RGB;
}

function luminance([r, g, b]: RGB): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const AA_BODY = 4.5;
const AA_LARGE = 3;

describe("sidebar contrast in dark mode", () => {
  // The rail is .glass-ink over the page background.
  const scrim = rgba(tokenIn('[data-theme="dark"] {', "--color-glass-ink"));
  const background = hex(tokenIn('[data-theme="dark"] {', "--color-background"));
  const panel = composite(scrim.rgb, scrim.a, background);

  const override = '[data-theme="dark"] .glass-ink,';
  const onInk = hex(tokenIn(override, "--color-on-ink"));
  const onInkSoft = hex(tokenIn(override, "--color-on-ink-soft"));
  const onInkMute = hex(tokenIn(override, "--color-on-ink-mute"));
  const inkRaised = hex(tokenIn(override, "--color-ink-raised"));
  const tan = hex(tokenIn(override, "--color-tan"));

  it("keeps the scrim dark, which is why the text must stay light", () => {
    // If this ever goes light, the override below is wrong rather than right,
    // and the whole approach needs revisiting instead of the numbers nudging.
    expect(luminance(panel)).toBeLessThan(0.05);
  });

  it("passes AA for the wordmark and workspace name (on-ink)", () => {
    expect(ratio(onInk, panel)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it("passes AA for inactive nav labels (on-ink-soft)", () => {
    // These are the labels that were invisible: Dashboard, Inbox, Campaigns,
    // DM Logs, Settings, Diagnostics.
    expect(ratio(onInkSoft, panel)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it("passes AA for the SELF-HOSTED label (on-ink-mute)", () => {
    expect(ratio(onInkMute, panel)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it("passes AA for the active nav item (tan on ink-raised)", () => {
    expect(ratio(tan, inkRaised)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it("keeps the active pill distinguishable from the panel", () => {
    // The active item is identified by its fill, so the fill has to be
    // visible as a shape, not just legible as text.
    expect(ratio(inkRaised, panel)).toBeGreaterThanOrEqual(1.2);
  });
});

describe("sidebar contrast in light mode", () => {
  const scrim = rgba(tokenIn("@theme static {", "--color-glass-ink"));
  const background = hex(tokenIn("@theme static {", "--color-background"));
  const panel = composite(scrim.rgb, scrim.a, background);

  const onInk = hex(tokenIn("@theme static {", "--color-on-ink"));
  const onInkSoft = hex(tokenIn("@theme static {", "--color-on-ink-soft"));
  const onInkMute = hex(tokenIn("@theme static {", "--color-on-ink-mute"));
  const inkRaised = hex(tokenIn("@theme static {", "--color-ink-raised"));
  const tan = hex(tokenIn("@theme static {", "--color-tan"));

  it("passes AA for every label", () => {
    expect(ratio(onInk, panel)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(onInkSoft, panel)).toBeGreaterThanOrEqual(AA_BODY);
    expect(ratio(onInkMute, panel)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it("passes AA for the active nav item", () => {
    expect(ratio(tan, inkRaised)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it("keeps the rail dark enough to be the surface the tokens assume", () => {
    // The on-ink tokens are measured against solid --color-ink. If the scrim
    // gets more transparent again, they quietly stop meaning what they say --
    // which is how on-ink-mute ended up at 2.89:1.
    expect(luminance(panel)).toBeLessThan(0.04);
  });
});
