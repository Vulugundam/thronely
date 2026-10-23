"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import {
  adminConfigured,
  clearAdminSession,
  createAdminSession,
  isAdminSessionValid,
  passwordMatches,
} from "@/lib/admin-auth";
import { resetKeywordCache } from "@/lib/moderation";
import { saveKeywordSetting, setProductHidden } from "@/lib/admin";

/**
 * The /admin Server Actions.
 *
 * Every mutation re-verifies the session through `isAdminSessionValid()` before
 * touching anything: a Server Action is an HTTP POST endpoint reachable without
 * the UI (the bundled mutating-data guide's own warning), so the form that
 * renders a button is decoration, not authorisation.
 *
 * Redirects are all 303-style via `redirect()`, which in a Server Action
 * performs a client-side navigation when JS is available and serves a 303 in
 * its absence — so both the interactive and the no-JS path land on a GET.
 */

/**
 * Password login.
 *
 * Failure routes back to /admin with `?error=login` rather than rendering a
 * message from the action's return value: a plain `<form action>` submits a
 * full navigation, and a message has to survive that navigation somehow. The
 * query string is the same mechanism the checkout route uses for its refusals
 * (see src/app/api/stripe/checkout/route.ts), and there is nothing to
 * enumerate or throttle-signal here — there is exactly one password, so a
 * generic refusal gives away nothing that a login form does not.
 */
export async function login(formData: FormData): Promise<void> {
  if (!adminConfigured()) {
    redirect("/admin?error=unconfigured");
  }

  const password = String(formData.get("password") ?? "");
  if (!passwordMatches(password)) {
    redirect("/admin?error=login");
  }

  await createAdminSession();
  redirect("/admin");
}

/** End the session. */
export async function logout(): Promise<void> {
  await clearAdminSession();
  redirect("/admin");
}

/** Hide or unhide one product. The button's own label carries the intent. */
export async function toggleHidden(formData: FormData): Promise<void> {
  if (!(await isAdminSessionValid())) {
    redirect("/admin?error=auth");
  }

  const id = String(formData.get("id") ?? "");
  const hidden = String(formData.get("hidden") ?? "") === "true";
  if (!id) return;

  await setProductHidden(id, hidden);

  /*
   * The board routes need no invalidation (no `use cache` anywhere; their data
   * streams per request), but the admin table itself is what the caller is
   * looking at, and `refresh()` is what makes the row they just pressed show
   * its new state in the same response.
   */
  refresh();
}

/**
 * Replace the prohibited-keyword list.
 *
 * `resetKeywordCache()` is the load-bearing half: `loadProhibitedKeywords()`
 * caches the Setting for the life of the process (see ./moderation), so without
 * this the checkout would keep moderating against the old list until the
 * server restarted — the admin would see their edit saved and the site would
 * behave as though it hadn't been.
 */
export async function saveKeywords(formData: FormData): Promise<void> {
  if (!(await isAdminSessionValid())) {
    redirect("/admin?error=auth");
  }

  const value = String(formData.get("keywords") ?? "");
  await saveKeywordSetting(value);
  resetKeywordCache();

  refresh();
}
