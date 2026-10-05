# Opening the vault on the free plan

**Status: PLAN, approved in substance 2026-10-04, not built.**

The seven vault-protected sections stop being gated whole by `requirePremium`
and become available to everyone, capped by how much you can put in them.
Premium stops selling access and starts selling capacity.

**Owner's framing:** "give a limited data set but all capabilities". The
strategic goal is a user base rather than near-term revenue, because the
intended exit is a sale of the application once it reaches scale.

---

## 1. The caps, as specified by the owner

| Section | Free | Premium |
|---|---|---|
| Legal Documents | 2 | unlimited |
| Financial Affairs | 1 | unlimited |
| Property and Possessions | 1 | unlimited |
| Household Info | 1 | unlimited |
| Digital Life | 2 | unlimited |
| Donation Bank | 1 | unlimited |
| Your Last Moments | 1 | unlimited |

Donation Bank and Your Last Moments are single-record sections already, so
their "1" is inherent rather than a new limit. They still need
`requirePremium` removed.

**Uploads: 3 files on the free plan**, across everything. Files are the one
limit with real unit economics behind them: a row in Postgres is free to keep,
a 20MB PDF in R2 is not.

## 2. What Premium sells afterwards

- No caps anywhere.
- Uploads beyond the free 3.
- The vault-inclusive PDF export. The free export already exists and already
  excludes vault content, so this is the status quo.
- 10 trusted contacts instead of 2.

**This is a materially thinner proposition than today**, and that is the
deliberate trade. Worth stating plainly so nobody is surprised when conversion
falls: today Premium sells access to the most valuable part of the product,
and afterwards it sells headroom.

## 3. Uploads, resolved

Counted separately, owner's decision 2026-10-04:

| | Free | Premium |
|---|---|---|
| Documents and photos (general uploads) | 3 | unlimited |
| Funeral gallery photos | 5 | 30 |

The funeral gallery keeps its existing free allowance of 5 rather than being
folded into the general cap of 3. Nothing is taken away from anyone who
already has it, which matters: it would have been the only change in this
whole plan that made the product worse for an existing user, and funeral
photos are the worst place to do that.

Note the premium gallery figure drops from 50 to 30. Nobody is on it, so this
costs nothing today, but it is a reduction and the two plan-limit files must
change together.

## 4. Work involved

1. Remove `requirePremium` from the seven sections in `server/routes/sections.js`.
2. Add the six new cap keys to `server/lib/planLimits.js` **and** its
   hand-synced mirror `client/src/constants/planLimits.js`, same commit. Add
   `uploaded_documents` for the file cap.
3. Enforce the upload cap in `server/routes/documents.js`, which currently has
   a per-file size limit but no count limit.
4. Surface the caps with `PlanLimitNotice`, which already exists and already
   has the right copy and the `alwaysShow` and `omitCount` options.
5. Dashboard: remove the "Premium sections" divider, the lock badges and the
   `FREE_ROUTES` split in `client/src/pages/DashboardPage.jsx`. All 21 sections
   become reachable.
6. Rewrite the plan comparison in `client/src/constants/planFeatures.js`, the
   Upgrade page, and the Stripe feature list in `server/routes/billing.js`.
7. The vault-inclusive export stays behind `requirePremium` in
   `server/routes/export.js`. Unchanged.

## 5. Risks worth naming

- **Storage cost per free user becomes non-zero.** Three files at up to 20MB is
  up to 60MB per free account. At 100,000 users that is a real number, and it
  arrives whether or not anyone pays. The file cap is the only thing standing
  between the free plan and an unbounded bill.
- **Conversion will fall**, probably a lot, since the main reason to pay is
  being removed. That is the intended trade, but it should be measured rather
  than assumed: there is currently no instrumentation recording that a user hit
  a cap, saw the notice, or clicked through to the upgrade page. Without it the
  effect of this change is unknowable.
- **The free plan now carries the sensitive data.** Medical records, financial
  details and credentials from users who pay nothing. Support, breach exposure
  and compliance obligations all scale with the free user base rather than with
  revenue.
