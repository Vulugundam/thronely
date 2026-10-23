import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import {
  adminConfigured,
  isAdminSessionValid,
} from "@/lib/admin-auth";
import { firstParam } from "@/lib/search-params";
import {
  getKeywordSetting,
  listAllProductsAdmin,
  listRecentBidsAdmin,
} from "@/lib/admin";
import { formatUsd } from "@/lib/pricing";
import { login, logout, saveKeywords, toggleHidden } from "./actions";

/**
 * /admin — hide/unhide products, view bids, edit the prohibited-keyword list.
 *
 * Everything the page shows is behind one <Suspense> boundary, because the
 * session cookie is request data: under `cacheComponents` it cannot be read in
 * the page body without making the route blocking. The shell above the
 * boundary is the same static prerender every other page gets.
 *
 * Not in the sitemap, not indexed, and not linked anywhere public — an
 * operator knows where it is.
 */

export const metadata: Metadata = {
  title: "Admin",
  description: "Thronely moderation.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/admin" },
};

function AdminSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading the admin panel"
      className="glass-strong rounded-card p-6"
    >
      <span className="sr-only">Loading the admin panel…</span>
      <div className="skeleton h-6 w-40 rounded" />
      <div className="skeleton mt-6 h-10 w-full max-w-xs rounded-lg" />
      <div className="skeleton mt-3 h-10 w-full max-w-xs rounded-lg" />
    </div>
  );
}

const LOGIN_ERROR_COPY: Record<string, string> = {
  login: "That password is not right.",
  auth: "Your session had expired — sign in again.",
  unconfigured:
    "No admin password is configured on this deployment. Set ADMIN_PASSWORD and restart.",
};

export default function AdminPage({
  searchParams,
}: PageProps<"/admin">) {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-14 sm:px-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
          Moderation
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold text-ivory sm:text-4xl">
          Admin
        </h1>
      </header>

      <div className="mt-10">
        <Suspense fallback={<AdminSkeleton />}>
          <AdminContent searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * The session check and all three admin queries, resolved per request inside
 * the boundary. One async component rather than three: the session decides
 * which of the two views (login or panel) renders at all, so the queries only
 * run when they have a viewer.
 */
async function AdminContent({
  searchParams,
}: Pick<PageProps<"/admin">, "searchParams">) {
  const params = await searchParams;
  const error = firstParam(params.error);
  const configured = adminConfigured();
  const authenticated = await isAdminSessionValid();

  if (!configured) {
    return (
      <section className="glass-strong rounded-card p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold text-ivory">
          Admin is locked
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-mist">
          No <code className="text-gold-400">ADMIN_PASSWORD</code> is set on
          this deployment, so nobody can sign in. Set it in the environment and
          restart the server to enable this page.
        </p>
      </section>
    );
  }

  if (!authenticated) {
    return (
      <section className="glass-strong rounded-card p-5 sm:p-6">
        {error && LOGIN_ERROR_COPY[error] ? (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-violet-400/30 bg-violet-400/8 p-4 text-sm leading-relaxed text-mist"
          >
            {LOGIN_ERROR_COPY[error]}
          </div>
        ) : null}

        <h2 className="font-display text-lg font-bold text-ivory">
          Sign in
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-mist">
          Enter the admin password to moderate the board.
        </p>

        <form action={login} className="mt-6 flex flex-col gap-3 sm:flex-row">
          <label htmlFor="admin-password" className="sr-only">
            Admin password
          </label>
          <input
            id="admin-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Admin password"
            className="w-full rounded-lg border border-white/12 bg-abyss-900 px-3 py-2.5 text-sm text-ivory placeholder:text-slate-dim/60 sm:max-w-xs"
          />
          <button type="submit" className="btn-claim px-4 py-2.5 text-sm">
            Sign in
          </button>
        </form>
      </section>
    );
  }

  const [productData, bidData, keywordsRaw] = await Promise.all([
    listAllProductsAdmin(),
    listRecentBidsAdmin(),
    getKeywordSetting(),
  ]);

  const statusCount = (status: string) => bidData.counts[status] ?? 0;

  return (
    <div className="space-y-8">
      <nav aria-label="Admin sections" className="flex gap-2">
        {[
          { href: "#products", label: "Products" },
          { href: "#bids", label: "Bids" },
          { href: "#keywords", label: "Keywords" },
        ].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-lg px-3 py-2 text-sm text-mist transition-colors hover:bg-white/6 hover:text-ivory"
          >
            {item.label}
          </a>
        ))}
        <form action={logout} className="ml-auto">
          <button
            type="submit"
            className="rounded-lg px-3 py-2 text-sm text-slate-dim transition-colors hover:bg-white/6 hover:text-ivory"
          >
            Sign out
          </button>
        </form>
      </nav>

      {/* ---------------------------------------------------------- products */}
      <section
        id="products"
        aria-labelledby="products-heading"
        className="glass-strong rounded-card p-5 sm:p-6"
      >
        <h2
          id="products-heading"
          className="font-display text-lg font-bold text-ivory"
        >
          Listings
        </h2>
        <p className="mt-1 text-sm text-slate-dim">
          {productData.total} total. Hiding removes a listing from the board and
          from pricing; its money and history stay on record.
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-[0.12em] text-slate-dim">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Listing
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Category
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Total paid
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  State
                </th>
                <th scope="col" className="py-2 font-semibold">
                  <span className="sr-only sm:not-sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {productData.products.map((product) => (
                <tr key={product.id}>
                  <td className="py-2.5 pr-4">
                    <Link
                      href={`/product/${product.slug}`}
                      className="text-ivory underline decoration-white/20 underline-offset-4 transition-colors hover:text-gold-300"
                    >
                      {product.title}
                    </Link>
                    <span className="ml-2 text-xs text-slate-dim">
                      {product.slug}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-mist">
                    {product.category.name}
                  </td>
                  <td className="py-2.5 pr-4 text-mist">
                    {formatUsd(product.totalPaidCents)}
                  </td>
                  <td className="py-2.5 pr-4">
                    {product.hidden ? (
                      <span className="text-violet-300">Hidden</span>
                    ) : (
                      <span className="text-mist">Visible</span>
                    )}
                  </td>
                  <td className="py-2.5">
                    {/*
                     * The new state is sent explicitly rather than flipping a
                     * read value server-side: the row the admin is looking at
                     * is definitely the intent, and a stale toggle racing a
                     * second admin still ends at a definite state.
                     */}
                    <form action={toggleHidden}>
                      <input type="hidden" name="id" value={product.id} />
                      <input
                        type="hidden"
                        name="hidden"
                        value={product.hidden ? "false" : "true"}
                      />
                      <button
                        type="submit"
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-mist transition-colors hover:bg-white/6 hover:text-ivory"
                      >
                        {product.hidden ? "Unhide" : "Hide"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {productData.total > productData.products.length ? (
          <p className="mt-3 text-xs text-slate-dim">
            Showing the top {productData.products.length} by money paid.
          </p>
        ) : null}
      </section>

      {/* -------------------------------------------------------------- bids */}
      <section
        id="bids"
        aria-labelledby="bids-heading"
        className="glass-strong rounded-card p-5 sm:p-6"
      >
        <h2
          id="bids-heading"
          className="font-display text-lg font-bold text-ivory"
        >
          Bids
        </h2>
        <p className="mt-1 text-sm text-slate-dim">
          {statusCount("paid")} paid · {statusCount("pending")} pending ·{" "}
          {statusCount("failed")} failed
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-[0.12em] text-slate-dim">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Listing
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Amount
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Status
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Created
                </th>
                <th scope="col" className="py-2 font-semibold">
                  Paid
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {bidData.bids.map((bid) => (
                <tr key={bid.id}>
                  <td className="py-2.5 pr-4">
                    <Link
                      href={`/product/${bid.product.slug}`}
                      className="text-ivory underline decoration-white/20 underline-offset-4 transition-colors hover:text-gold-300"
                    >
                      {bid.product.title}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-4 text-mist">
                    {formatUsd(bid.amountCents)}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={
                        bid.status === "paid"
                          ? "text-gold-300"
                          : bid.status === "pending"
                            ? "text-mist"
                            : "text-violet-300"
                      }
                    >
                      {bid.status}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-mist">
                    <time dateTime={bid.createdAt.toISOString()}>
                      {bid.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                    </time>
                  </td>
                  <td className="py-2.5 text-mist">
                    {bid.paidAt ? (
                      <time dateTime={bid.paidAt.toISOString()}>
                        {bid.paidAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                      </time>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {bidData.bids.length === 0 ? (
          <p className="mt-3 text-xs text-slate-dim">No bids yet.</p>
        ) : null}
      </section>

      {/* ---------------------------------------------------------- keywords */}
      <section
        id="keywords"
        aria-labelledby="keywords-heading"
        className="glass-strong rounded-card p-5 sm:p-6"
      >
        <h2
          id="keywords-heading"
          className="font-display text-lg font-bold text-ivory"
        >
          Prohibited keywords
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-dim">
          One keyword per line. A submission whose title or description
          contains any of these words is refused at checkout, on every board.
        </p>

        <form action={saveKeywords} className="mt-5">
          <label htmlFor="keywords-input" className="sr-only">
            Prohibited keywords, one per line
          </label>
          <textarea
            id="keywords-input"
            name="keywords"
            rows={8}
            defaultValue={keywordsRaw ?? ""}
            spellCheck={false}
            className="w-full resize-y rounded-lg border border-white/12 bg-abyss-900 px-3 py-2.5 font-mono text-sm leading-relaxed text-ivory placeholder:text-slate-dim/60"
          />
          <button type="submit" className="btn-claim mt-4 px-4 py-2.5 text-sm">
            Save keywords
          </button>
        </form>
      </section>
    </div>
  );
}
