# FiHaven competitive roadmap

How FiHaven compares to popular personal-finance apps, what to borrow from each,
and a prioritized checklist tracked as GitHub issues.

**Principle:** Keep FiHaven’s depth (bills, debt, rewards, sync, native apps) and
add **optional lenses** that automate the math — Dollarwise-style — without
becoming another noisy “do everything” app.

---

## What FiHaven already does well

| Area | Status |
|------|--------|
| Bills / cards / loans | Core — due dates, promos, autopay memory |
| Budget | Income sources, obligations, leftover/cushion, savings goals |
| Subscriptions | Finder (flagged bills + recurring tx), price hikes, stale subs |
| Spending | Manual transactions + category budgets (Pro) |
| Debt | Avalanche/snowball planner (Pro) |
| Net worth | Accounts + card balances |
| Reminders | Email + local notifications, weekly digest |
| Positioning | Manual-first, sync, security, native apps |

---

## Competitor map

| App | Why people love it | FiHaven angle |
|-----|-------------------|---------------|
| **Dollarwise** | One rule (50/30/20), math done for you | Optional **budget rule lens** on Budget tab |
| **Rocket Money / Truebill** | Sub detection, cancellations, bill alerts | Detection exists; add **action panel** (cancel links, duplicates, trials) |
| **YNAB** | Every dollar has a job; envelopes | Power users — borrow **assign targets**, not full ZBB |
| **Monarch** | Household, flexible budgets, net worth | Long-term: shared household; short-term: rollup views |
| **Copilot** | Beautiful UI, auto-categorization, insights | Manual-first + suggested categories; period insights (Pro) |
| **Credit Karma** | Free credit score + monitoring | Different lane unless bureau API partnership |
| **Albert** | Auto-save, low effort | Opt-in rules only (conflicts with manual-first default) |
| **NerdWallet** | Education + product comparison | Marketing/content, not core app |
| **QuickBooks** | SMB books, invoices, taxes | Out of scope unless freelance mode added later |

---

## Priority tiers

### Tier 1 — Shipped in 1.4.x

1. **Budget rules lens (50/30/20 + custom splits)** — optional setting; Needs / Wants / Save
   targets vs actuals on Budget tab (web + iOS + Android). See `client/js/budgetRules.js`.
2. **Subscription action panel** — cancel/manage links, duplicate hints, free-trial dates.
3. **Safe-to-spend number** — after bills, mins, and goal assignments: one “cash left” figure.

### Tier 2 — Pro differentiators (shipped in 1.4.x)

| Feature | Source | Hook |
|---------|--------|------|
| Envelope / zero-based lite | YNAB | Assign leftover to goals/categories each period |
| Spending insights | Copilot | “Up X% on Dining vs last period” |
| Credit utilization alert | CK / NerdWallet | From manual card balances (no bureau API) |

### Tier 3 — Shipped in 1.5.x

| Feature | Notes |
|---------|-------|
| Budget lens settings on native | Settings → Budget lens on iOS and Android |
| Envelope editor + spending insights on native | Budget tab envelope assign (Pro); Spending insights vs last period (Pro) |
| Household rollup views | `GET /api/household/rollup` + dashboard card + Family settings on all platforms |
| User category → bucket overrides | Settings → Category buckets (web + native) |

### Tier 4 — Next / later

| Feature | Notes |
|---------|-------|
| Remote push (APNs / FCM) | Email + local notifications today |
| Store distribution | TestFlight (iOS); Play internal testing (Android) |

### Tier 5 — Skip or partner

- Bill negotiation (Truebill) — humans or B2B APIs
- Credit score pull — regulatory + bureau deals
- QuickBooks parity — different product
- Heavy AI coach — on-device / suggested rules only

---

## Feature checklist

Track progress in GitHub issues (labels: `competitive`, `tier-1`, `tier-2`). Tier 1/2
items from the 1.4.x wave are closed; open issues cover Tier 3+ gaps.

```
Competitive parity
├── Dollarwise
│   ├── [x] 50/30/20 (or custom %) budget lens
│   ├── [x] Auto-map categories → needs/wants/save
│   └── [x] “Simple budget” onboarding toggle
├── Truebill / Rocket Money
│   ├── [x] Subscription detection
│   ├── [x] Price increase flags
│   ├── [x] Cancel / manage links per subscription
│   ├── [x] Duplicate sub detection
│   ├── [x] Trial-ending reminders
│   └── [x] Safe-to-spend / cash left number
├── YNAB
│   └── [x] Optional envelope assign (Pro)
├── Monarch
│   └── [x] Household sharing (create/join on all platforms; share UI web-first)
├── Copilot
│   └── [x] Period-over-period spending insights (Pro)
├── Credit Karma / Albert
│   ├── [x] Credit util alerts (from manual card balances)
│   └── [ ] Auto-save rules — optional / out of scope for now
└── QuickBooks
    └── [ ] Out of scope unless SMB mode
```

---

## Settings contract (budget rule)

Synced in the user `settings` blob (see [`native-contract.md`](native-contract.md)):

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `budgetRule` | see native-contract | `"off"` | Lens mode |
| `budgetRuleSplits` | `{ needs, wants, save }` | `{50,30,20}` | Custom split only |
| `debtFocusExtra` | number | `0` | Extra debt payment for debt-focus lens |

### Lens modes

| Mode | What it shows |
|------|----------------|
| `50-30-20`, `80-20`, `60-20-20`, `70-20-10`, `custom` | Needs / wants / save targets vs actuals |
| `obligations-first` | **Safe to spend** after bills, mins, and goal contributions |
| `debt-focus` | Debt minimums + extra payment → flexible spending |
| `envelope` | **Pro** — goals + category budgets vs income (zero-based lite) |

Housing (≤30%) and debt payment (≤36%) ratio warnings appear on any active lens when applicable.

Bill categories map to buckets in `budgetRules.js` / native cores. Spending
categories follow the same mapping. Users can override mappings in a future release.

---

## Bill field: free trial

| Key | Type | Notes |
|-----|------|-------|
| `trialEnds` | `"YYYY-MM-DD"` optional | On subscription bills; panel shows countdown; reminders at 3 days |

---

## Related code

| Area | Web | Native |
|------|-----|--------|
| Budget rule logic | `client/js/budgetRules.js` | `BudgetRules.kt`, `BudgetRules.swift` |
| Budget UI | `BudgetView.svelte`, `BudgetRulePanel.svelte` | `BudgetView.swift`, `BudgetScreen.kt` |
| Subscriptions | `subscriptionsFinder.js`, `subscriptionLinks.js` | `SubscriptionsFinder.kt/swift` |
| Settings | `settings.html`, `settings.js` | `SettingsView`, `SettingsScreen` |
