import { requireEnv } from "@/lib/env";
import { capabilitiesFor } from "@/lib/meta/platform";

/**
 * Connecting a Facebook Page.
 *
 * The shape a user sees is the same as Instagram's: one button, one Meta
 * dialog, one connected account. Underneath it is a different flow, because a
 * Page is not something a person logs in AS — it is something a person
 * ADMINISTERS. So where Instagram hands back a token for the account itself,
 * Facebook hands back a token for the *person*, and that token is then traded
 * for a list of the Pages they manage, each with its own token.
 *
 * Three consequences worth stating, because they are what makes this file
 * longer than the Instagram equivalent:
 *
 *   1. A person may manage zero, one, or forty Pages. There is always a
 *      selection step, even when it resolves automatically.
 *   2. Managing a Page is not enough. Sending a message needs the MESSAGING
 *      task on that Page specifically, and a Page where the person is, say,
 *      only an Analyst will come back in the list and then fail at send time.
 *      Filtering on tasks here turns a confusing later failure into a clear
 *      "you do not have messaging access to this Page" now.
 *   3. A Page access token derived from a LONG-LIVED user token does not
 *      expire. Deriving it from the short-lived one gives a token that dies in
 *      about an hour, which would look like the integration randomly breaking
 *      the same afternoon it was set up. The order of the calls below is
 *      load-bearing for that reason.
 */

const FACEBOOK_OAUTH_URL = "https://www.facebook.com/v26.0/dialog/oauth";

/**
 * What the app asks for.
 *
 * pages_show_list       — see which Pages this person manages
 * pages_messaging       — send the DM and the private reply
 * pages_manage_metadata — subscribe the Page to our webhook
 *
 * pages_read_engagement is deliberately absent. It is what would let the
 * campaign builder list a Page's posts, but adding it to this app also adds it
 * to the live Instagram use case (Meta says so explicitly when you enable it),
 * and that is not a change to make in passing.
 */
const SCOPES = [
  "pages_show_list",
  "pages_messaging",
  "pages_manage_metadata",
] as const;

/**
 * Facebook Login for Business authorises against a saved *configuration*
 * rather than a scope list: the permissions live in the config, and the app
 * passes its id. Classic Facebook Login still takes a scope list.
 *
 * Which one an app uses depends on how it was set up, so this supports both
 * rather than guessing — set FACEBOOK_LOGIN_CONFIG_ID to use the business
 * flow, leave it unset for the classic one.
 */
export function getFacebookAuthorizationUrl(
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: requireEnv("FACEBOOK_APP_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  });

  const configId = process.env.FACEBOOK_LOGIN_CONFIG_ID;
  if (configId) {
    params.set("config_id", configId);
  } else {
    params.set("scope", SCOPES.join(","));
  }

  return `${FACEBOOK_OAUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: { message?: string; code?: number; error_subcode?: number };
}

async function tokenRequest(url: URL): Promise<{
  accessToken: string;
  expiresIn?: number;
}> {
  const response = await fetch(url.toString());
  const data = (await response.json()) as TokenResponse;

  if (!response.ok || data.error || !data.access_token) {
    const message = data.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`Facebook token exchange failed: ${message}`);
  }

  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

export async function exchangeFacebookCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; expiresIn?: number }> {
  const url = new URL(`${capabilitiesFor("FACEBOOK").graphBase}/oauth/access_token`);
  url.searchParams.set("client_id", requireEnv("FACEBOOK_APP_ID"));
  url.searchParams.set("client_secret", requireEnv("FACEBOOK_APP_SECRET"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);

  return tokenRequest(url);
}

/**
 * Trade the short-lived user token for a long-lived one (~60 days).
 *
 * Must happen BEFORE reading /me/accounts. Page tokens inherit the lifetime of
 * the user token they were derived from, and a Page token derived from a
 * long-lived user token carries no expiry at all — which is what makes the
 * connection survive without a refresh job.
 */
export async function getLongLivedUserToken(
  shortLivedToken: string
): Promise<{ accessToken: string; expiresIn?: number }> {
  const url = new URL(`${capabilitiesFor("FACEBOOK").graphBase}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", requireEnv("FACEBOOK_APP_ID"));
  url.searchParams.set("client_secret", requireEnv("FACEBOOK_APP_SECRET"));
  url.searchParams.set("fb_exchange_token", shortLivedToken);

  return tokenRequest(url);
}

export interface FacebookPage {
  id: string;
  name: string;
  accessToken: string;
  /** Page-level tasks this person holds, e.g. MESSAGING, MANAGE, MODERATE. */
  tasks: string[];
  /** False when the person manages the Page but cannot message from it. */
  canMessage: boolean;
}

interface AccountsResponse {
  data?: Array<{
    id?: string;
    name?: string;
    access_token?: string;
    tasks?: string[];
  }>;
  paging?: { next?: string };
  error?: { message?: string };
}

/** The Page task required to send a message or a private reply. */
export const MESSAGING_TASK = "MESSAGING";

/**
 * Every Page this person manages, each with its own token.
 *
 * Paginated deliberately. The default page size is small, and someone who
 * manages Pages for clients can easily exceed it — silently connecting from a
 * truncated list would show them "your Page isn't here" for a Page that is.
 */
export async function listManagedPages(
  userAccessToken: string
): Promise<FacebookPage[]> {
  const first = new URL(`${capabilitiesFor("FACEBOOK").graphBase}/me/accounts`);
  first.searchParams.set("fields", "id,name,access_token,tasks");
  first.searchParams.set("limit", "100");
  first.searchParams.set("access_token", userAccessToken);

  const pages: FacebookPage[] = [];
  let next: string | undefined = first.toString();
  // A cursor loop with no ceiling is a hang waiting for a malformed response.
  let guard = 0;

  while (next && guard++ < 20) {
    const response: Response = await fetch(next);
    const data = (await response.json()) as AccountsResponse;

    if (data.error) {
      throw new Error(`Could not list Pages: ${data.error.message}`);
    }

    for (const page of data.data ?? []) {
      if (!page?.id || !page?.access_token) continue;
      const tasks: string[] = page.tasks ?? [];
      pages.push({
        id: String(page.id),
        name: page.name ?? "Untitled Page",
        accessToken: page.access_token,
        tasks,
        canMessage: tasks.includes(MESSAGING_TASK),
      });
    }

    next = data.paging?.next;
  }

  return pages;
}

/**
 * Point the Page's webhooks at us.
 *
 * The app-level subscription (the callback URL and field list, configured once
 * in the dashboard) says where events go. This says which Page sends them.
 * Both are required: without this call the app is subscribed to nothing and
 * the integration is silent, which looks identical to a broken webhook.
 */
export async function subscribePageToWebhooks(
  pageId: string,
  pageAccessToken: string
): Promise<void> {
  const { graphBase, subscribedFields } = capabilitiesFor("FACEBOOK");
  const url = new URL(`${graphBase}/${pageId}/subscribed_apps`);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscribed_fields: subscribedFields.join(","),
      access_token: pageAccessToken,
    }),
  });

  const data = await response.json();
  if (!response.ok || data.error || data.success === false) {
    throw new Error(
      `Could not subscribe the Page to webhooks: ${
        data.error?.message ?? `HTTP ${response.status}`
      }`
    );
  }
}

/** What Meta believes this Page is subscribed to, as opposed to what we asked for. */
export async function getPageSubscriptions(
  pageId: string,
  pageAccessToken: string
): Promise<string[]> {
  const url = new URL(
    `${capabilitiesFor("FACEBOOK").graphBase}/${pageId}/subscribed_apps`
  );
  url.searchParams.set("access_token", pageAccessToken);

  const data = await fetch(url.toString()).then((r) => r.json());
  if (data.error) {
    throw new Error(`Could not read Page subscriptions: ${data.error.message}`);
  }

  return (data.data ?? []).flatMap(
    (entry: { subscribed_fields?: string[] }) => entry.subscribed_fields ?? []
  );
}
