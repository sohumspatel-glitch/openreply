/**
 * Connecting a Facebook Page.
 *
 * The parts worth pinning are the ones where getting it wrong produces a
 * working-looking connection that fails later: a Page token derived from the
 * wrong user token (dies in an hour), a Page the person cannot actually
 * message (fails at send time), and a truncated Page list (the Page "isn't
 * there" when it is).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV = {
  FACEBOOK_APP_ID: "1610439867306325",
  FACEBOOK_APP_SECRET: "test-secret",
  META_GRAPH_API_VERSION: "v26.0",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  Object.assign(process.env, ENV);
  delete process.env.FACEBOOK_LOGIN_CONFIG_ID;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function json(body: unknown, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 400, json: async () => body });
}

describe("getFacebookAuthorizationUrl", () => {
  it("asks for exactly the three permissions the integration needs", async () => {
    const { getFacebookAuthorizationUrl } = await import("@/lib/meta/facebook-oauth");
    const url = new URL(getFacebookAuthorizationUrl("https://x.test/cb", "st"));
    const scope = url.searchParams.get("scope")!.split(",");

    expect(scope.sort()).toEqual([
      "pages_manage_metadata",
      "pages_messaging",
      "pages_show_list",
    ]);
  });

  it("does not request pages_read_engagement", async () => {
    // Enabling it on this app also enables it on the live Instagram use case.
    // Meta warns about this explicitly; it is not a change to make in passing.
    const { getFacebookAuthorizationUrl } = await import("@/lib/meta/facebook-oauth");
    const url = getFacebookAuthorizationUrl("https://x.test/cb", "st");
    expect(url).not.toContain("pages_read_engagement");
  });

  it("carries the signed state through", async () => {
    const { getFacebookAuthorizationUrl } = await import("@/lib/meta/facebook-oauth");
    const url = new URL(getFacebookAuthorizationUrl("https://x.test/cb", "signed-state"));
    expect(url.searchParams.get("state")).toBe("signed-state");
    expect(url.searchParams.get("redirect_uri")).toBe("https://x.test/cb");
  });

  it("switches to config_id for Facebook Login for Business", async () => {
    // The business flow puts permissions in a saved configuration instead of
    // the query string. Which one this app uses depends on how it was set up,
    // so both are supported rather than assumed.
    process.env.FACEBOOK_LOGIN_CONFIG_ID = "cfg_123";
    const { getFacebookAuthorizationUrl } = await import("@/lib/meta/facebook-oauth");
    const url = new URL(getFacebookAuthorizationUrl("https://x.test/cb", "st"));

    expect(url.searchParams.get("config_id")).toBe("cfg_123");
    expect(url.searchParams.get("scope")).toBeNull();
  });
});

describe("listManagedPages", () => {
  it("marks a Page the person cannot message", async () => {
    fetchMock.mockReturnValueOnce(
      json({
        data: [
          { id: "1", name: "Startscalr", access_token: "tok1", tasks: ["MESSAGING", "MANAGE"] },
          { id: "2", name: "Read Only", access_token: "tok2", tasks: ["ANALYZE"] },
        ],
      })
    );

    const { listManagedPages } = await import("@/lib/meta/facebook-oauth");
    const pages = await listManagedPages("user-token");

    expect(pages.map((p) => [p.name, p.canMessage])).toEqual([
      ["Startscalr", true],
      ["Read Only", false],
    ]);
  });

  it("follows pagination instead of trusting the first page", async () => {
    // Someone managing client Pages can exceed the page size. Connecting from
    // a truncated list tells them their Page is missing when it is not.
    fetchMock
      .mockReturnValueOnce(
        json({
          data: [{ id: "1", name: "A", access_token: "t1", tasks: ["MESSAGING"] }],
          paging: { next: "https://graph.facebook.com/next-page" },
        })
      )
      .mockReturnValueOnce(
        json({ data: [{ id: "2", name: "B", access_token: "t2", tasks: ["MESSAGING"] }] })
      );

    const { listManagedPages } = await import("@/lib/meta/facebook-oauth");
    const pages = await listManagedPages("user-token");

    expect(pages.map((p) => p.id)).toEqual(["1", "2"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops rather than looping forever on a self-referential cursor", async () => {
    fetchMock.mockReturnValue(
      json({
        data: [{ id: "1", name: "A", access_token: "t", tasks: [] }],
        paging: { next: "https://graph.facebook.com/same" },
      })
    );

    const { listManagedPages } = await import("@/lib/meta/facebook-oauth");
    await listManagedPages("user-token");

    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(20);
  });

  it("skips entries with no token rather than storing a broken connection", async () => {
    fetchMock.mockReturnValueOnce(
      json({
        data: [
          { id: "1", name: "No Token", tasks: ["MESSAGING"] },
          { id: "2", name: "Fine", access_token: "t2", tasks: ["MESSAGING"] },
        ],
      })
    );

    const { listManagedPages } = await import("@/lib/meta/facebook-oauth");
    const pages = await listManagedPages("user-token");
    expect(pages.map((p) => p.id)).toEqual(["2"]);
  });

  it("surfaces a Graph error instead of returning an empty list", async () => {
    // An empty list and a failed call mean opposite things to the user: "you
    // manage no Pages" versus "we could not ask".
    fetchMock.mockReturnValueOnce(json({ error: { message: "Invalid OAuth token" } }, false));

    const { listManagedPages } = await import("@/lib/meta/facebook-oauth");
    await expect(listManagedPages("bad")).rejects.toThrow(/Invalid OAuth token/);
  });
});

describe("token exchange", () => {
  it("exchanges the short-lived token before Pages are read", async () => {
    // Page tokens inherit the lifetime of the user token they came from. Derive
    // them from the short-lived one and the whole integration dies in an hour.
    fetchMock.mockReturnValueOnce(json({ access_token: "long-lived", expires_in: 5183944 }));

    const { getLongLivedUserToken } = await import("@/lib/meta/facebook-oauth");
    const result = await getLongLivedUserToken("short");

    const called = new URL(fetchMock.mock.calls[0][0]);
    expect(called.searchParams.get("grant_type")).toBe("fb_exchange_token");
    expect(called.searchParams.get("fb_exchange_token")).toBe("short");
    expect(result.accessToken).toBe("long-lived");
  });

  it("throws with Meta's message when the exchange fails", async () => {
    fetchMock.mockReturnValueOnce(
      json({ error: { message: "This authorization code has expired." } }, false)
    );

    const { exchangeFacebookCode } = await import("@/lib/meta/facebook-oauth");
    await expect(exchangeFacebookCode("stale", "https://x.test/cb")).rejects.toThrow(
      /authorization code has expired/
    );
  });

  it("treats a 200 with no token as a failure", async () => {
    fetchMock.mockReturnValueOnce(json({}));
    const { exchangeFacebookCode } = await import("@/lib/meta/facebook-oauth");
    await expect(exchangeFacebookCode("c", "https://x.test/cb")).rejects.toThrow();
  });
});

describe("subscribePageToWebhooks", () => {
  it("subscribes the fields the platform module declares", async () => {
    fetchMock.mockReturnValueOnce(json({ success: true }));

    const { subscribePageToWebhooks } = await import("@/lib/meta/facebook-oauth");
    await subscribePageToWebhooks("page_1", "page-token");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subscribed_fields.split(",").sort()).toEqual([
      "feed",
      "messages",
      "messaging_postbacks",
    ]);
  });

  it("throws when Meta reports success:false on a 200", async () => {
    // The Graph API answers this endpoint with a body flag rather than a
    // status code, so checking response.ok alone silently accepts a failure.
    fetchMock.mockReturnValueOnce(json({ success: false }));

    const { subscribePageToWebhooks } = await import("@/lib/meta/facebook-oauth");
    await expect(subscribePageToWebhooks("page_1", "tok")).rejects.toThrow();
  });
});
