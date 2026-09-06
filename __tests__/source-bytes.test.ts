import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * No stray control bytes in source.
 *
 * This has bitten twice. A raw NUL used as a hash separator in
 * lib/meta/outbound-guard.ts made grep classify that file as binary, so
 * searching it during an incident returned "Binary file matches" instead of
 * the line — on the one file whose job is to stop a runaway send. Separately,
 * a regex written through a shell heredoc had its \b collapsed into a literal
 * backspace (0x08), which silently stopped the relevance filter matching
 * almost anything.
 *
 * Both were invisible in review and neither broke a build. The escape
 * sequences (\0, \b, \x1b) are byte-identical at runtime and readable, so
 * there is never a reason for the raw byte to appear in a source file.
 */

const ALLOWED = new Set([0x09, 0x0a, 0x0d]); // tab, newline, carriage return

function trackedSourceFiles(): string[] {
  return execFileSync("git", ["ls-files", "*.ts", "*.tsx", "*.mts", "*.mjs"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
}

describe("source files", () => {
  const files = trackedSourceFiles();

  it("finds files to check", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("contain no raw control bytes", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const bytes = readFileSync(file);
      const found = new Map<number, number>();

      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b < 0x20 && !ALLOWED.has(b)) {
          if (!found.has(b)) {
            found.set(b, bytes.subarray(0, i).toString("utf8").split("\n").length);
          }
        }
      }

      for (const [byte, line] of found) {
        offenders.push(
          `${file}:${line} contains 0x${byte.toString(16).padStart(2, "0")} ` +
            `— write it as an escape sequence instead`
        );
      }
    }

    expect(offenders).toEqual([]);
  });

  it("are valid UTF-8", () => {
    const offenders: string[] = [];
    const decoder = new TextDecoder("utf-8", { fatal: true });

    for (const file of files) {
      try {
        decoder.decode(readFileSync(file));
      } catch {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});
