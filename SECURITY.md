# ChronoStar X — Security & Polish Notes (v5.2)

## The one that actually mattered: privilege escalation
**Found:** the "update own profile" database policy let a logged-in member update *any* column on their own row — including `role`. The app's UI never exposed a way to set it, but nothing stopped someone from calling the Supabase API directly (e.g. from browser devtools) with `{ role: 'owner' }` and promoting themselves.

**Fixed in `schema.sql` §6a:** a trigger on `profiles` now silently reverts any client-initiated `role` change unless the person making it is already an owner. SQL run from the Supabase dashboard (which has no client auth context) is unaffected, so the owner-promotion line still works normally. The same trigger also makes `created_at` immutable once set.

**Action needed:** re-run `schema.sql` — this fix only takes effect in the database, not just in these files.

## Other things checked and fixed
- **Bio links / post images could carry a `javascript:` URL.** A link's `href` executes when clicked, unlike an `<img src>`. Now blocked in three places at once: the input is validated before it's even sent (`isSafeUrl()` in `app.js`), the database strips any non-http(s) URL on save regardless of what the client sends (`sanitize_profile_links` trigger, `schema.sql` §6b), and display-time rendering refuses to turn an unsafe URL into a clickable link even for data saved before this fix.
- **XSS audit of every `innerHTML` write** across `tools.js` and `app.js`: anywhere content isn't from the app's own fixed strings (a scanned QR code's content, API responses, post titles, usernames, activity log entries) now goes through `esc()` before being inserted. A few spots that were technically low-risk (browser's own `navigator.userAgent`, the IP-lookup API response) got escaped anyway for consistency — no reason to trust a third-party response by default.
- **Length limits**, mirrored on both ends so the database is never relying on the frontend alone: username ≤40, bio ≤500, post title ≤200, post content ≤5000, max 10 bio links.
- **Content-Security-Policy** added (`index.html` `<head>`). Worth being honest about its limits: it's not a *strict* CSP — the app still uses inline `onclick=` attributes and inline `style=` throughout (removing all of those is a much bigger rewrite than this pass), and `connect-src` stays open to any `https:` host on purpose, because the "Cek Status Website" and latency tools are built to reach whatever domain you type in. Within that, it still does real work: no scripts load from anywhere except the two trusted CDNs, no `<object>`/plugins, the page can't be framed by another site (clickjacking), and `<base>`/form targets are locked to the same origin.
- **Autocomplete hints** on auth fields (`current-password` vs `new-password`, `email`) — small thing, but it's what lets password managers and browsers do the right thing.
- Confirmed (not a finding, just verified): nowhere in the codebase builds a SQL string from user input — every query goes through the Supabase query builder, which parameterizes values. The "SQL Injection Pattern Scanner" tool is a separate, self-contained text analyzer; it doesn't touch the real database.

## Visual polish (no functional changes)
- Tabs now fade/slide in instead of snapping.
- Every tappable element (buttons, cards, chips, nav) gets a tactile press-down effect — there's no hover state on a phone, so this is what makes a button feel responsive.
- Slim custom scrollbar instead of the default browser one.
- A breathing glow on the "● ONLINE" text.
- A small spinner now shows during the 5 tools that wait on a network response (password breach check, temp mail, my-connection, site reachability, latency monitor) instead of just changing text.
- News/Info lists show a shimmering skeleton placeholder on first load instead of a plain "Memuat..." line.
- Toasts show a ✓ / ✕ / ℹ icon matching their type.

## Still worth knowing about (not fixed here, by design or by scope)
- **Rate limiting** (signups, tool API calls) isn't implemented — that needs server-side logic (a Supabase Edge Function), which is a separate piece of infrastructure beyond this pass. Low real risk at this app's current scale, but worth knowing if it ever gets abused.
- **The CSP's `'unsafe-inline'` for scripts** is the one real gap in an otherwise locked-down policy — a byproduct of the app relying on inline `onclick=` handlers throughout. Closing it fully means rewriting event wiring to use `addEventListener` everywhere, which is a legitimate follow-up if you want it, just a bigger job than this round.
