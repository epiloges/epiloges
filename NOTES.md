# Session Summary — 2026-09-13 (evening): admin audit, and the fixes for it

Quick-reference recap of the LATEST session only. See `PROGRESS.md` for the build log and
`AUDIT.md` for the customer-facing audit. The previous session's notes follow below,
unchanged, because the Piraeus and courier material in them is still current.

## Read this first

**Seventeen commits on `main`, `b17f9ea`…`b3c6fa8`, NOT pushed.** `tsc`, `eslint` (0 errors),
`next build` and all **576 unit tests** are green. One of them adds a column:

```bash
npx prisma migrate deploy
```

runs `20260913200000_order_internal_note` (additive, nullable — apply it BEFORE the push
lands, the old code ignores the column). Then `git push origin main`.

**Local dev was pointed at the LIVE database.** `.env`'s `DATABASE_URL` is production. The
audit and every fix were exercised on the Neon test branch through
`scripts/_audit/dev-sandbox.mjs` (launch config `alexandris-audit-sandbox`, port 3010, email in
no-send mode). Keep using that for anything destructive; `scripts/_audit/q.mjs '<sql>'` runs
ad-hoc SQL against the branch. The two throwaway admin accounts it seeds were removed.

## What the audit found, in one paragraph

Orders had no state machine — Delivered → Confirmed → Refunded → Shipped all worked, each step
emailing the customer, the cancel/refund steps restocking units that never came back, and
"Refunded" never touching the payment. Shipping, navigation, homepage, site settings and SEO
saved whatever the browser sent (a delivery rate of −5 € subtracted from every order; the hero
published with no image). The product form accepted a sale price ABOVE the price and the cart
charged it. The CSV import published rows by default and invented visible categories from typos.
Gift-card codes were typed ("GIFT50") and redemption had no rate limit. Most admin writes were
missing from the activity log, which showed no times. GDPR erasure left every email the shop had
sent the person, address and all. And a long tail: editors saw a Delete button that crashed the
page, revenue counted refunded orders, Inventory could not edit inventory, customers had no page.

## What changed, by commit

| | |
| --- | --- |
| `b17f9ea` | **Order + return state machine** (`lib/order-transitions.ts`). Paid orders cannot be cancelled/refunded until the payment is refunded; uncollected ones cannot be "refunded" at all. Un-cancelling re-takes stock or refuses. Full payment refund → order refunded. Selects confirm with the consequence and revert on refusal. No vouchers for cancelled/delivered orders. |
| `ed52334` | **Zod on every `setSiteContent` write** (`lib/validation/site-content.ts`); forms show the message; remote-area surcharge now editable. |
| `3138020` | Product form: sale < price, compare-at ≥ price, trimmed names/SKUs, unique sizes, real image URLs, two decimals. **"In stock" is now "Sellable" and checkout honours it.** Duplicate no longer copies stock. |
| `4e6c817` | CSV import: draft by default, typo status = error, auto-categories hidden and inside the row transaction, preview warnings, friendly errors, downloadable template + column reference. |
| `c15a82e` | Generated gift-card codes; 20/10 min limit on code redemption; discount expiry = end of day Athens; discounts editable at `/admin/discounts/[id]`. |
| `94e5453` | Audit log covers inline/bulk edits, payment settings, categories, collections, media, blog; Activity shows time + linked target. **Cannot disable the last payment method.** |
| `d692122` | GDPR erasure deletes `email_log` rows; 180-day email-body retention; guest returns anonymised. |
| `5d03987` | Editors: no Delete button, gated new/edit pages, actions return errors. |
| `afe8566` | Sales figures exclude cancelled/refunded (`lib/order-revenue.ts`), Greek money format. |
| `fd9e045` | Inventory page edits stock and sellable per size. |
| `7520644` | Collection delete blocked while homepage/nav reference it; bulk delete ≥10 needs the count typed. |
| `7f206cf` | Blog scheduling; newsletter export (was a dead button) + removal; Emails paged/searchable; admins can reset another admin's password. |
| `c1f21fa` | Customers aggregated in SQL, searchable, paged; `/admin/customers/[key]` detail page; order → customer link. |
| `c24e15c` | Order internal note (**migration**), history from the audit trail, printable packing slip. |
| `08579f8` | No cart/wishlist/session calls or cookie banner on /admin; dnd-kit hydration warning; dead Currency field read-only; login keeps the email. |
| `7faeadb` | `{freeShippingThreshold}` in announcements is filled from Shipping settings. **Edit the live announcement once to use it** — it still says "100 €" by hand while the threshold is 150. |
| `b3c6fa8` | Published-post reads are `"use cache"` (hourly, tagged) so the journal prerenders. |

## Left deliberately undone

- **2FA on the admin.** Real work (TOTP enrolment, recovery codes); not a one-evening add-on.
- **Invoices / αποδείξεις.** The packing slip is explicitly not a tax document; that belongs to the
  accounting software, or to a later integration with it.
- **Discount usage limits / minimum order / product scope.** Schema work; the code now at least
  supports editing and correct expiry.
- **The 928 KB PNG in Media** (`black-suede-loafer-…-mayro-5.png`): PERF-003 converted JPEGs only.
  Re-encode it by hand or extend the migration script to PNGs.
- **Production newsletter list**: the test branch is full of `gdpr-*@example.test` rows from test
  runs that once targeted production. Check the live list and remove them if they are there.
- **The Playwright suite was not run** this session — it needs a server on the test branch and the
  `alexandris-prod` launch config points at `.env` (production). The checkout integration tests
  against the branch passed.

---

# Session Summary — 2026-09-06 → 09-07 (performance, real 404s, and an audit that kept correcting itself)

Quick-reference recap of the LATEST session only — this file gets replaced each session, it's the fast catch-up, not the archive. See `PROGRESS.md` for the detailed build log and **`AUDIT.md` for everything below in full**.

## Read this first

**The shop is live at https://shopalexandris.vercel.app**, HEAD is `0da6d45`, tree clean, all 28
commits pushed to `origin/main`. `tsc` / `eslint` / `next build` green, **455 unit tests**,
**44 browser specs**, health endpoint reporting `healthy`.

**Two owner-facing docs, and they are separate copies that do NOT sync:**
- `AUDIT.md` in this repo — the engineering source of truth.
- https://claude.ai/code/artifact/83ae5d39-da47-4a63-a835-912a2e9db761 — the published audit.
  **Update it in place by passing that URL as `url`.** "Update the audit" almost always means both.

## The one thing that is actually wrong

**`OPS-001` is much smaller than this repo has been saying, and the correction is the useful
part.** As of 09-07 the position is: **Vercel's scheduler works here**, retention is being
enforced automatically, and the one thing genuinely outstanding is that the `data-retention`
slot has never been *watched*.

**Vercel's cron fires.** `email-followups` (`0 8 * * *`) has sent abandoned-cart mail at 08:56,
08:57, 08:03, 08:32 and 08:56 UTC across five dates — every one inside its slot's hour, which
is exactly how Hobby crons behave. It fired at 08:56 on 09-07. The other days it ran and had
no eligible cart, so it left no trace: the blind spot the run log now fills.

**The evidence that retention was "still failing" was three measurement defects, not a bug.**

1. **The marker test could not discriminate.** 33 rows were nominated as "gone means it ran
   late, still there means it never runs". `lib/rate-limit.ts` prunes rows over a day old on
   ~1% of calls, so it deletes them too.
2. **A non-zero overdue count is the NORMAL state of a working daily job.** A job deleting
   rows older than two days always leaves those created between its last cutoff and two days
   ago — a set that grows all day and empties at the next run. The 33 rows and the 198 rows
   recorded as proof of failure are what a healthy job produces. Only rows older than the last
   *pass's own cutoff* mean anything.
3. **Every timestamp the ad-hoc tooling printed was three hours early.** `createdAt` is
   `TIMESTAMP(3)` **without** time zone, and node-postgres parses such columns in the client's
   local zone — Athens, UTC+3. The DB session is `GMT`, so the SQL counts were right and only
   the displayed instants were wrong, which is the dangerous combination. It flipped the 09-07
   reading on its own: the oldest surviving row was 04:55 UTC, not 01:55, which is *newer* than
   the 03:30 slot's cutoff and was supposed to survive.

**The 09-05 finding survives all of it** — 1,639 rows with the oldest 45 days old was real, and
retention genuinely had never run until the manual trigger. What is not established is that it
has failed since.

**Retention no longer depends on the cron either way.** `runDataRetentionIfDue` runs the full
pass from ordinary request traffic when a day passes with no recorded run — verified in
production on 09-07: 492 overdue rows to zero, no human involved. And all three jobs now record
their own runs, so the check is one command:

```bash
npm run cron:status
```

It refuses to conclude anything until a slot has actually elapsed under observation. Telling
you the cron is dead before it has had a chance is the precise error this finding made three
times.

Two explanations also died on 09-07, one of them a hypothesis this repo had been carrying:
**the plan cron limit is a myth** — Vercel documents 100 cron jobs per project on *every* plan.
Also dead: a cached response masking the run (`X-Vercel-Cache: MISS`, so the function really
does execute).

**If you read one thing into this:** all three defects share a shape. Each was a number
trusted because it was a number, without first asking *what a passing result would look like*.
None survives that question.

Everything else open is a choice about money or timing: the 6-hour restore window, image
optimization (`PERF-001`), the CSP nonce (`SEC-003`), and `PERF-002` — now deliberately deferred.

## What shipped

| | |
| --- | --- |
| `PERF-003` | **309 catalogue JPEGs re-encoded to WebP.** 32.39 MB → 15.61 MB (**52%**), 0 failures. Rollback material and a README in `.image-migration-2026-09-06/`. |
| `SEO-002` | Unknown product/category/collection URLs answered **200**; they now 404 properly. |
| `PERF-004` | Add-to-cart **1245ms → 1045ms**, by removing wasted round trips. |
| `TEST-001` | Suite was flaky on a cold Neon branch; `hookTimeout` raised to 30s. |

## Things that will bite whoever picks this up next

1. **`git push` hangs intermittently.** Git Credential Manager wants an interactive login this
   environment cannot drive; it fails with `unable to get password from user` or just hangs. It
   stalled this session four or five times. **The owner running `git push origin main` once clears
   it.** Commit locally and ask rather than retrying forever.

2. **The browser suite does not pass in one run, and that is not a bug.** A full pass takes ~9
   minutes and runs desktop before mobile, outliving the shop's own `cart-create` limit (60 per 10
   min, `app/api/cart/route.ts`). Desktop spends the budget; every mobile cart spec then fails
   against a limiter doing its job. **Run them alone and they pass.** This has now cost two separate
   investigations — the tell is always: all mobile, all cart, all fine in isolation.

3. **Vercel's image optimizer is still DELIBERATELY OFF** (`images.unoptimized`) — the transform
   quota is exhausted. `PERF-003` re-encoded the *source* files instead, which is a different thing
   and does not close `PERF-001`.

4. **The build's route table and production disagree**, and it is unresolved. `next build` calls
   154 routes `ƒ Dynamic` including `/`, while the edge serves those same routes as `PRERENDER` at
   ~0.2s. The user-visible result is measured and not in doubt; the bookkeeping is not understood.

5. **Dates come from the commit, not from memory.** This session ran past midnight and six entries
   were stamped a day early before the owner caught it. Use `git log`.

6. **`next build` is not silent, and it was not silent before this session either.** It prints
   three `cookies() rejects when the prerender is complete` errors, on `/api/customer/referrals`,
   `/api/admin/media` and `/api/customer/orders`. The message names `after`, so the obvious
   assumption is that the retention fallback caused them — it did not: building `5c4bee6`, before
   any of that work, produces the same three. Unexplained, not investigated, and the build still
   succeeds. Worth an entry of its own if anyone has an hour.

## A shipping rate does not know which courier carries it (2026-09-07)

Checkout now shows **"Παράδοση κατ' οίκον / ACS Courier · 3–5 εργάσιμες ημέρες"**, and that
carrier name is **presentation only** — free text in the rate's `description` field.

`ShippingRateSetting` has no carrier or provider field, and `lib/courier/index.ts` picks its
provider from the `COURIER_PROVIDER` environment variable alone. So adding, say, ΕΛΤΑ as a
second rate would display correctly and then create its voucher through whichever single
provider that variable names. **It would look right and route wrong**, which is the worst
combination — nothing fails, and the parcel goes to the wrong courier.

Closing that means a `carrier` (or `courierProvider`) field on the rate, carried onto the
order, with `getCourierProvider()` taking it as an argument instead of reading one global. Not
worth building before a second courier actually exists — but worth knowing the gap is there
rather than discovering it the day one is added.

Related, and the reason this is not urgent: the ACS integration itself has still never been
exercised (see below), so there is exactly one courier path today and it is unproven.

**Presentation rule, while there is one courier:** method in the label, carrier in the
description. Flip it when a second courier appears — two rows both titled "Παράδοση κατ'
οίκον" and distinguishable only by their subtitles is worse than putting the carrier first,
because by then the carrier is what is being chosen.

## Customer audit fixes (2026-09-13)

A strict end-to-end walk of the live shop as a first-time customer, desktop and mobile, found
twenty-six things; all the code-level ones are fixed and deployed the same day. The ones that
mattered most: **the order confirmation page crashed for every successful order** (a render
function passed for a plain `{email}` argument in `Confirmation.confirmationSentTo` — tags take
functions, arguments take values); the FAQ said *"this is a demo store — no payment is
charged"*; Shipping & Returns, Our Story, Sustainability and Careers were English template copy
describing a shoemaker with ateliers and €150 free shipping. All content pages are Greek now
and derived from the Terms of Service + live shipping settings — keep them in step: the Terms
used to say 30-day free returns while the announcement bar said 14; the owner confirmed **14
days, free** (the shop pays the return shipping), and every page, the Terms and the product
accordion now say exactly that.

Also new: `/search` results page (the overlay only previews six); inline error for a bad
discount code; category context on `?category=` listings; New In = flagged OR added in the last
45 days; delivery estimates count from the courier handover (next working day on a Sunday or
after 14:00); amber ≤2-unit stock dots with a legend instead of red dots everywhere; single
sizes pre-selected; `WC-…` SKUs hidden; the mock address autocomplete removed; country names
via `Intl.DisplayNames`; every English leftover on the storefront translated, including the
persisted COD/bank-transfer instruction labels.

**Data was cleaned in place** (57 descriptions with literal `
`, 22 with a stale "3–5
εργάσιμες" promise, colour-name casing). **Product names were NOT touched** — an attempt to
strip supplier codes went wrong because the slug's trailing number is a uniqueness suffix, not
the store code, and was fully reverted from a Neon point-in-time branch. 26 products still carry
supplier codes in their names (Guess/Valentino bags, U.S. Polo); renaming them is the owner's
job, by hand, in the admin.

## Email audit (2026-09-13/14)

**Why customers were not getting email:** `EMAIL_FROM` is `onboarding@resend.dev`, Resend's
test sender, which delivers only to the Resend account owner — every other recipient is
rejected — and the transport logged successes only. A rejected send threw, the caller wrote a
console line, and Vercel Hobby keeps runtime logs for an hour. Nobody could have known. The
fix is the owner's: verify a sending domain in Resend and set `EMAIL_FROM` to an address on
it (see `.env.example`). Until then, the admin dashboard and Emails page carry a red banner —
`getEmailHealth()` in `lib/email/index.ts` — and every failed send is a row on
`/admin/emails?status=failed` with the provider's reason and a Retry button.

**What changed underneath:** `lib/email/pipeline.ts` wraps the transport — marketing
templates are dropped for opted-out addresses and get an unsubscribe footer + RFC 8058
`List-Unsubscribe` headers; transient provider errors retry three times; every outcome
(sent / failed / skipped, attempts, provider message id) is an `email_log` row. Opt-out is
`email_unsubscribes` + `Customer.acceptsMarketing`, via `/api/email/unsubscribe` (GET page,
POST one-click). The Resend key is send-only, so nothing can be verified through their API.

**The big gap:** a card payment settling through the Piraeus webhook sent *nothing* — the
confirmation only went out when the shopper revisited the confirmation page.
`services/order-notifications.ts` now owns every email an order sends as payment moves
(confirmation once via claim-then-release, payment received for a hand-confirmed transfer,
payment failed/expired with a retry link, partial refund with the amount, the shop's own copy
of every sale) and `applyStatus` in `services/payments.ts` calls it. Order links in emails
carry a signed 180-day token so a guest can open the order from their phone. Forms now answer
the sender (contact, concierge, returns, newsletter welcome once) with Reply-To on the shop
copy; OAuth first sign-in gets the welcome; all links come from `getSiteUrl()`, never the
request host.

**Not built, on purpose:** email verification at sign-up (Google/Apple/Facebook verify for
us; the password form does not — a design gap, not a bug), invoices, SMS. **Untested live:**
payment-received/failed/refund flows need Piraeus credentials that do not exist yet; they are
exercised only through `applyStatus` in the sandbox.

## Piraeus Bank replaces Stripe as the card rail (2026-09-13)

**What changed.** Stripe and Apple Pay are gone (files, tests, env vars). `lib/payments/providers/piraeus.ts`
is no longer a boundary: it is the real **epay eCommerce "Redirection"** integration — ticket issued
server-side over SOAP, shopper POSTed to `paycenter.piraeusbank.gr/redirection/pay.aspx` through the
new bridge page `/api/payments/redirect/:paymentId`, result posted back through the browser to
`/api/payments/webhooks/piraeus` and verified with HMAC-SHA256 keyed on the one-time ticket. Everything
else in the architecture is untouched; `PAYMENTS.md` §12 documents it. 93 payment tests green, the
HashKey test is the bank's own published vector.

**Where the spec came from, honestly.** The bank hands its Redirection manual to merchants on
activation; it is not on a public developer portal. This build used the manual as reproduced,
field-for-field, in two public reference implementations (thanpa/PaycenterBundle, which carries the
parameter table and test vector verbatim, and ouranosv/piraeus-bank-redirection). Endpoints, SOAP
namespace, field order, the MD5 password digest, the result fields and the HashKey recipe all agree
across both. **When the bank's own PDF arrives, diff it against `piraeus.ts` before the first live
transaction** — the most likely divergences are a ticket-expiry value and any field added since.

**The owner has the acquiring contract, not the gateway.** What exists is a Euronet EMS contract
(TID / MID / settlement IBAN — the physical-POS kind). The gateway needs a separate **epay eCommerce
activation** on that contract, which yields the five credentials the admin page asks for: Acquirer ID
(14), e-commerce Merchant ID, POS ID (vPOS), username, password — plus a TEST merchant and test cards.
Nothing here can be exercised end to end until those arrive. Ask Euronet Merchant Services / the
Piraeus business banker for "ενεργοποίηση epay eCommerce (Redirection) στη σύμβαση acquiring".

**Three generic additions, not Piraeus special cases**, because every Greek bank gateway works this way:
`CustomerAction.redirectForm` (a redirect that must be a POST — the service routes it through the bridge
page), `WebhookRequest.findPayment` (a parser whose signing key is per-payment can look the payment up),
and `PaymentProvider.webhookDelivery: "browser"` (the webhook route 303s a person to their order instead
of answering JSON). `next.config.ts` excludes only the bridge path from the site-wide CSP, because the
bridge must `form-action` to the bank; the bridge sets its own equally strict policy.

**The one rule that will look like a bug and is not:** a declined card never marks the payment
`failed`. The bank signs successes only — `HashKey` is blank on failure — so a decline is stored,
attributed and shown in the admin, but the payment stays `awaiting_customer_action` until an admin
cancels it. Applying an unsigned "failed" would let anyone who knew the reference block a later genuine
success (`failed → paid` is not a legal transition). The shopper still sees the honest outcome.

**Do not put the contract numbers in the repo.** The MID/TID/IBAN the owner pasted in chat belong in
Vercel env / the admin form, never in code or docs.

## ACS courier — test credentials arrived, activation pending (2026-09-13)

**Superseded the entry below.** ACS sent TEST web-services credentials on 13 September with
their June-2024 REST guide. They are in `.env` (git-ignored) — same endpoint as production,
non-billable numbers — and `COURIER_PROVIDER` is deliberately still `manual` there, so the
admin cannot put a test voucher on a real order. ACS said the credentials sync overnight:
**nothing works before the morning of 14 September**, and a pickup date must be a working
day (never a Sunday or public holiday).

**What ACS wants back before activating:** a test voucher PDF (laser or thermal, whichever
printer the shop has) and the matching test pickup-list PDF. `npm run acs:test` produces
exactly those into `./acs-test/` — voucher to the shop's own address with a fake reference,
printed both ways, closed into a pickup list, list printed. It calls
`createAcsCourierProvider` directly and touches no order. `--delete <voucher>` cancels one
that is not yet on a list. Email the PDFs to the ACS contact who sent the credentials.

**What is now built, and pinned to the guide rather than guessed** (`lib/courier/providers/acs.ts`,
tests in `acs.test.ts`): the response envelope — `ACSExecution_HasError`,
`ACSOutputResponce` (sic) → `ACSValueOutput[0]` / `ACSTableOutput.Table_Data` — and the
per-row `Error_Message` that carries a rejected voucher; `ACS_Print_Voucher` (Print_Type
2 = A4 laser, 1 = thermal) with the PDF found by shape rather than key name, because the
guide does not say the key; `ACS_Issue_Pickup_List` including the "unprinted vouchers"
refusal, `ACS_Print_Pickup_List`, `ACS_Get_Pickup_Lists`, `ACS_Delete_Voucher`.
**Αντικαταβολή is on the voucher now** (`Cod_Ammount` / `Cod_Payment_Way` 0 / `COD`): the
previous adapter would have shipped a cash-on-delivery order with nothing to collect. The
customer's delivery note goes into `Delivery_Notes`; `Item_Quantity` is 1 (parcels, not
pairs — ACS issues a voucher per parcel).

**The cycle the admin has to follow, because ACS's model demands it:** create the voucher on
the order → print it (order page, "Print A4" / "Print thermal") → at the end of the day
issue the pickup list at `/admin/courier` → print the list for the driver. A voucher that
is never printed blocks the day's list; a voucher on a list can no longer be cancelled from
the shop. The PDF routes are `/api/admin/courier/voucher` and `/api/admin/courier/pickup-list`.

**Verified live the same day** (credentials worked immediately): full cycle, PDFs correct,
`Recipient_Region` = city routes fine for Heraklion. **One thing the guide gets wrong and the
code now relies on:** `ACS_Print_Voucher` returns ONE single-page A4 PDF PER VOUCHER
(`ACSValueOutput[0].ACSObjectOutput[{ Voucber_No (sic), PDFData (base64) }]`), every one
with its label in the same `Start_Position` slot and the rest of the page painted white.
"Three labels per sheet" is therefore assembled by us: one call per slot, then
`lib/courier/label-sheets.ts` crops each page to its third and overlays them (pdf-lib).
Overlaying uncropped pages leaves only the last label visible — that was the first attempt.

**Batch printing is the daily workflow** (`/admin/courier`): vouchers accumulate under "To
print", the admin prints three at a time to an A4 sheet (or fewer at day's end, with a
start-slot picker to finish a half-used sheet), printed ones wait under "Printed, waiting
for pickup", and issuing the list stamps `pickupListNo` on the orders ACS reports as
closed (`ACS_Pickup_List_Display_Voucher`). `voucherPrintedAt` / `pickupListNo` are the
two order columns behind this (migration 20260913120000, applied to production).

**Go-live checklist:** ACS confirms the PDFs and activates → ACS may issue PRODUCTION
credentials (ask; the email calls these the test server) → put them in Vercel, set
`COURIER_PROVIDER=acs` there and locally → create one real voucher on a real order and print it.

## ACS courier — waiting on ACS for the API key (2026-09-07) — superseded above

**Blocked on a third party, not on code.** The owner emailed ACS on 7 September asking for web
services access. Everything else is in place.

**There is a trap in `.env` right now.** `ACS_API_KEY` holds a **3-character placeholder**, and
`getCourierProvider()` only checks that each credential is non-empty — so a placeholder passes
the guard. Set `COURIER_PROVIDER=acs` today and it will **not** fall back to `manual` as
designed; it will build a real ACS client with a junk key and fail every shipment against ACS's
auth. Delete the line, or leave `COURIER_PROVIDER` unset, until the real key arrives.

**What was verified on 2026-09-07, and what was not.** The spec was fetched from
`https://webservices.acscourier.net/ACSRestServices/swagger/docs/v1` — the Swagger UI at
`/swagger/` cannot load its own definition because of CORS, which is worth knowing before
concluding the API is down.

- **Request side: verified.** Endpoint, `ACSAlias`/`ACSInputParameters` envelope, `AcsApiKey`
  header and every field sent all appear in ACS's documented `ACS_Create_Voucher` example.
  `Reference_Key1` was missing and is now sent (the order id), which is what makes
  `ACS_POD_FROM_REFERENCE_NO` usable and cannot be added to a voucher after the fact.
- **Response side: NOT verified, and not verifiable from the spec.** ACS declares
  `"responses": {"200": {}}` for every operation and ships an empty `"definitions"` object.
  The envelope names that circulate for it — `ACSOutputResponse`, `ACSExecution_HasError`,
  `ACSValueOutput` — appear **nowhere** in the file; they came from a summariser and did not
  survive a grep. The defensive multi-key parsing in `lib/courier/providers/acs.ts` stays until
  a real voucher comes back. Do not "tidy" it into a single confident key name.

**Ask ACS for TEST credentials, not production.** Their documented onboarding sends test web
services first, and you are expected to exercise voucher issue/print/delete against them. That
removes the awkward part — `ACS_Create_Voucher` creates a real, billable label with no
idempotency key, so testing against production means a voucher ACS expects to collect.

**When the key arrives:** put it in `.env`, run ONE voucher through a script that calls
`createAcsCourierProvider(...)` directly — bypassing `COURIER_PROVIDER`, so the live shop is
untouched — capture the raw response body, and pin the parser to what ACS actually returned.
Only then set `COURIER_PROVIDER=acs`, and in Vercel as well as locally. The newest official
guide is *ACS Rest API Web Services, English, Sep 2024*; its response-format section is the
one thing that could settle the parsing without a live call.

## `PERF-002` is deferred, deliberately — do not "resume" it

Its headline benefit **already landed**: enabling Cache Components dropped `no-store`, which let the
CDN hold the HTML, and warm TTFB went ~1.0s → ~0.2–0.4s. Three routes the build calls *dynamic*
all serve in ~0.2–0.3s. **The CDN is already doing what PPR would.**

What remains would improve only the cache-miss path, for a services-layer migration (`"use cache"`
is in 1 of 48 service files) plus server-side locale reads that live in **components**, not only
pages. Two triggers to revisit, both in `AUDIT.md`: traffic making misses material, or products
getting translated.

**And a correction worth keeping:** `"use cache"` was never being rejected. Next's prerender error
names the *nearest render position*, not the actual uncached access — it kept pointing at a cached
layout call while the real blocker was `SectionRenderer.tsx:27` calling `getLocale()`. Clear the
nearer blockers and the message walks inward. Do not trust its first answer.

## Audit scoring

Overall **74 → 92**, and the number is the **mean of the eleven dimensions, rounded** — it had
drifted to 95 against an average of 92.3, which is now stated under the table so it cannot drift
again. Performance rose 74 → 85 on measurement; Reliability fell 92 → 88 because it had credited
"scheduled retention" that does not run.
