# termin — slide deck (10 slides)

> Convert to PDF (Marp, Google Slides, Canva). Replace `[SIG]/[SCREENSHOT]` placeholders after the devnet recording.

---

## 1. termin — faktury, które płacą się same

Self-collecting B2B invoices on Solana.

**HackYeah — Superteam Poland Track**

Devnet program: `GhEAovtiaJj48DwEwXWfDEqkxrPhbLfbryTHNifQEhZ1`
Repo: https://github.com/zuhdev/termin · Video: `[VIDEO URL]`

---

## 2. Problem: zatory płatnicze

- **69% of Polish companies pay suppliers late** — 2nd worst in Europe (Intrum European Payment Report)
- A 10-person subcontractor waits **30–90 days** for an invoice while payroll runs monthly
- Chasing payments is manual, awkward, and often never happens
- KSeF makes invoices digital in 2026 — payment still isn't

_“The invoice exists on-chain. Why can't the payment live there too?”_

---

## 3. Target user

**Marek — IT subcontractor, Kraków, 10 people**

- 40% of invoices arrive 30+ days late
- ~2h/month spent on reminders and calls
- Today: send invoice → wait → remind → wait → maybe paid
- With termin: **send once → money arrives on the due date, automatically**
- Debtor keeps control: they sign the mandate, they can revoke before due; late fees are transparent and programmed

---

## 4. Solution

1. **Issuer** creates the invoice on-chain (amount, due date, late-fee terms)
2. **Payer signs once** — SPL delegate mandate: “pull `amount + max_fee` on the due date”
3. **Permissionless collection** — anyone triggers it at due; the program pulls the money and computes the late fee on-chain
4. **Optional LP advance** — get paid today at a small discount; the LP collects from the debtor

_Like a standing order — but for invoices, with teeth._

---

## 5. Live demo

|                                               |                |
| --------------------------------------------- | -------------- |
| Invoice overdue 2 days with live-accruing fee | `[SCREENSHOT]` |
| Authorize with one wallet signature           | `[SCREENSHOT]` |
| Collection transaction on Solana Explorer     | `[SCREENSHOT]` |

`[EXPLORER TX URL]`

---

## 6. How it works (all on-chain)

```
issuer ──create──▶ [invoice PDA] ◀──authorize── payer (SPL delegate: vault PDA)
                        │
        due date reached │ anyone can collect
                        ▼
   payer ──amount+fee──▶ issuer        (no LP)
   payer ──payout──────▶ LP ─ and ─ issuer ◀──(total−payout)  (LP advanced)
```

7 instructions · PDA per invoice · `transfer_checked` signed by `vault_authority` PDA
Late fee = `amount × bps/day × full_days_late`, capped — enforced by the program, not a promise

---

## 7. Why this works on Solana

- **Fractional-cent fees** make small B2B invoices economically viable (unlike L1 smart contracts)
- SPL token **delegate** is the native primitive for pull payments
- **Permissionless collection**: the issuer, a bot, or KSeF middleware can all trigger it
- On-chain fee math → no disputes, no “the reminder never arrived”

---

## 8. What we built (hackathon)

- **Anchor program** — 7 instructions, 11 LiteSVM tests, deployed to devnet
- **Reproducible build** — pinned 4.3.0 toolchain; `9a44d237…` artifact ≡ on-chain, re-checked in CI on every push
- **Codama-generated TS client** — type-safe end-to-end
- **Next.js app** — wallet-standard, cluster switch, create/authorize/collect/advance/revoke, live overdue fees
- **Demo seeder** — mint, wallets, overdue + LP-advanced scenarios in one command
- Verified end-to-end on a local validator and devnet: create → authorize → advance → collect (fee **+50 tUSD** on a 5,000 invoice 2 days overdue)

---

## 9. Roadmap

- **KSeF import** (2026 e-invoicing mandate): auto-create invoices from official XML
- Collection crank — truly zero-touch collection
- On-chain **reputation passport** (paid/revoked/collected history)
- Token-2022 multi-delegate / per-invoice mandate accounts
- Recurring (subscription) invoices

---

## 10. Team & links

`[NAMES]`

- Repo: https://github.com/zuhdev/termin
- Devnet program: `GhEAovtiaJj48DwEwXWfDEqkxrPhbLfbryTHNifQEhZ1`
- Video (3 min): `[VIDEO URL]`
- Try it: `npm install && npm run demo:devnet && npm run dev`

_termin — the invoice that collects itself._
