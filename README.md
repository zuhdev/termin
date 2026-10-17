# termin — faktury, które płacą się same

Self-collecting B2B invoices on Solana. The debtor signs a payment mandate once; the payment pulls itself on the due date — with on-chain late fees for the days it's late — and a liquidity provider can advance the invoice earlier at a discount.

Built for **HackYeah — Superteam Poland Track**.

- **Program (devnet):** `GhEAovtiaJj48DwEwXWfDEqkxrPhbLfbryTHNifQEhZ1`
- **App:** `npm run dev` → http://localhost:3000 — landing at `/`, console at `/app` (select Devnet in the header)
- **Live demo:** `https://<VERCEL-URL>/app`

## Try it live (for judges)

The devnet prototype is fully interactive — every button is a real Solana transaction.

1. Open the console: `https://<VERCEL-URL>/app` (Devnet).
2. Connect any Solana wallet (Phantom, Solflare, Backpack, …).
3. Click **Get test tUSD** in the console header — the built-in faucet mints 20,000 demo tUSD to your wallet (one request per minute, devnet only). Do this once per wallet/account you want to play.
4. **As seller:** _New invoice_ → sign. **As buyer:** connect a second wallet or Phantom account, open the invoice → _Authorize mandate_ → past the due date, _Collect_ (anyone can). **As lender:** on an authorized invoice, fill in the advance terms → _Advance_ (funded by the tUSD from step 3).
5. Every action links to the Solana Explorer; the program is at `GhEAov…EhZ1`.

The faucet is the only server-side piece (a stateless route that signs a `mintTo` with the demo mint authority); all invoice logic lives in the on-chain program.

## The problem

Poland has a late-payment epidemic — _zatory płatnicze_. Per Intrum's European Payment Report, **69% of Polish companies pay suppliers late**, the second-worst rate in Europe. A 10-person subcontractor waits 30–90 days for cash while payroll runs monthly, and chasing payments is manual and often never happens. KSeF makes e-invoicing mandatory in 2026, but payment terms stay stale.

## How it works

1. **Issuer creates an invoice** on-chain: amount, due date, late-fee terms (e.g. 50 bps/day, capped at 10%).
2. **Payer authorizes it** — one signature approves the program's vault PDA as SPL delegate on the payer's token account, with an allowance of `amount + fee_max`.
3. **Collect is permissionless.** After the due date _anyone_ can trigger collection (the issuer, the payer, a bot): the program signs as the delegate and pulls `amount + late_fee` from payer to issuer. Late fees are computed on-chain from full days overdue.
4. **Optional LP advance.** A liquidity provider can pay the invoice early: LP transfers `amount_in` to the issuer now; at collection the LP receives `payout` directly from the payer, and the issuer gets the remainder (`total − payout`, which includes the late fee).

Roles are enforced on-chain; token movement happens through SPL Token `transfer_checked` signed by the vault-authority PDA derived per invoice (`[b"vault_auth", invoice]`).

## Program

Anchor program at `anchor/programs/termin/src/lib.rs`.

| Instruction                          | Signer | What it does                                                                                                      |
| ------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------- |
| `create_invoice`                     | issuer | Creates the invoice PDA (`[b"invoice", issuer, invoice_id]`) with amounts, due date, fee terms, 32-byte reference |
| `authorize_invoice`                  | payer  | Approves vault PDA as delegate for `amount + fee_max`                                                             |
| `advance_invoice(amount_in, payout)` | LP     | Buys the invoice at a discount while it's Authorized/Overdue                                                      |
| `flag_overdue`                       | anyone | Marks a due, uncollected invoice as Overdue                                                                       |
| `collect_invoice`                    | anyone | Pulls `amount + late_fee`; waterfalls via LP when advanced                                                        |
| `revoke_invoice`                     | payer  | Payer can cancel the mandate before collection                                                                    |
| `cancel_invoice`                     | issuer | Issuer can void an unauthorized invoice                                                                           |

Late fee: `floor(amount · fee_bps_per_day · full_days_late / 10_000)`, capped at `amount · fee_cap_bps / 10_000`. Statuses: `Created → Authorized → (Overdue) → Collected | Cancelled | Revoked`.

## Reproducible / verified build

The devnet bytecode is deterministic and reproducible from this repo using the official Solana verifiable-build image:

- **Program hash:** `9a44d237b63fdd7fa34eec5672bad1e0bd0359117609b96a82ffed82191fc6f9` (the trailing-zero-trimmed hash `solana-verify` compares — same function for the file and for the on-chain program)
- Toolchain pinned via `[workspace.metadata.cli] solana = "4.3.0"` in `anchor/Cargo.toml`; `Cargo.lock` is committed.

Anyone can verify (requires Docker):

```shell
cd anchor
cargo install solana-verify --locked
solana-verify build --library-name termin
solana-verify get-executable-hash target/deploy/termin.so
solana-verify get-program-hash -u https://api.devnet.solana.com GhEAovtiaJj48DwEwXWfDEqkxrPhbLfbryTHNifQEhZ1
```

Both hashes must equal the value above. The same check runs in CI (`.github/workflows/verify-build.yml`) on every push. Note: the OtterSec "Verified Build" badge on Solana Explorer requires remote verification, which is available for mainnet deployments only — termin is a devnet prototype, so the deterministic build + hash comparison above is the equivalent guarantee (it is the same trimmed-byte hash the verification program compares).

## Repo layout

```
anchor/programs/termin/    Anchor program (src/lib.rs) + LiteSVM test suite (src/tests.rs)
app/                       Next.js UI (Tailwind, @solana/kit, wallet-standard, SWR)
app/generated/termin/      Codama-generated TypeScript client (from anchor IDL)
docs/deck.md               Slide deck (10 slides, placeholders after recording)
scripts/demo.ts            Seed + lifecycle script: mints demo USDC, 3 payer wallets, invoices, collect
scripts/codama-run.mjs     Programmatic Codama runner (Windows CLI workaround)
```

## Develop

Prerequisites: Rust + `cargo-build-sbf`, Anchor CLI 1.x, Node 20+, Agave/Solana CLI 4.x. Devnet artifacts are built with **4.3.0** (pinned in `anchor/Cargo.toml` via `[workspace.metadata.cli]`) so the on-chain hash stays reproducible.

```shell
npm install
cd anchor && anchor build -- --arch v0   # SBF v0 binary
anchor idl build -o target/idl/termin.json
cd .. && npm run codama:js               # regenerate app/generated/termin from the IDL
```

Note: `anchor build -- --arch v0` produces the `.so` but its built-in IDL step fails with the passthrough args; generate the IDL separately with `anchor idl build -o target/idl/termin.json`.

Tests (11 LiteSVM tests, no validator needed):

```shell
cd anchor && cargo test
```

### Local end-to-end

```shell
# terminal 1 (WSL/Linux): start a validator with the program preloaded
solana-test-validator --reset --bpf-program GhEAovtiaJj48DwEwXWfDEqkxrPhbLfbryTHNifQEhZ1 \
  anchor/target/deploy/termin.so

# terminal 2: seed demo state and exercise collection
npm run demo:local
npm run demo:local -- --collect=1002   # collect an overdue invoice (fee accrues)
npm run demo:local -- --collect=1003   # collect an LP-advanced invoice

npm run dev
```

`scripts/demo.ts` is idempotent and writes `NEXT_PUBLIC_DEMO_MINT` to `.env.local`. It prints base58 secrets for importing the demo wallets (issuer / payers A–C / LP) into Phantom.

### Deploy

Devnet deploys must use the deterministic build so the deployment stays hash-verifiable (see above):

```shell
cd anchor
cargo install solana-verify --locked        # one-time
solana-verify build --library-name termin   # builds in the pinned official Docker image
solana program deploy target/deploy/termin.so \
  --program-id target/deploy/termin-keypair.json --url devnet
```

`anchor build -- --arch v0` remains fine for localnet/LiteSVM work.

Then seed devnet: `npm run demo:devnet`.

For the in-app faucet, set two environment variables in the deployment: `NEXT_PUBLIC_DEMO_MINT` (the demo mint address) and `FAUCET_SECRET_KEY` (the JSON keypair array of the mint authority — the contents of `demo-keys/issuer.json`). Locally the faucet falls back to reading `demo-keys/issuer.json` directly, and `npx tsx scripts/mint-to.ts <wallet> [amount]` mints manually.

## Wallet support

Connect via **Wallet Standard** — Phantom, Solflare, Backpack, Glow, Coinbase Wallet, Trust and other compliant wallets work out of the box; the connect modal links installs for missing wallets. On Android, **Mobile Wallet Adapter** is registered automatically (`@solana-mobile/wallet-standard-mobile`), so Seed Vault / Phantom Mobile work in Chrome with no extension. Sessions restore silently on reload.

## Demo flow (for the video)

1. Invoice 1008 is **2 days overdue** — collect it and watch the 1% late fee (50 bps/day × 2 days) get pulled on-chain.
2. Invoice 1007 is **Created** — authorize it in the UI (one signature), then collect after the due date.
3. Invoice 1009 was **advanced by an LP** (4,800 now, 5,000 at due) — collect and watch the waterfall: payer → LP → issuer.

## Known limitations / design notes

- **One SPL delegate per token account.** The delegate model means a payer's token account can hold exactly one active mandate at a time — re-authorizing replaces the previous one. The demo therefore uses one payer per invoice. Roadmap: per-invoice mandate accounts (payer-funded escrow variant) or Token-2022 delegation extensions.
- **Debtor balance risk.** A mandate can be drained or revoked by the payer before the due date. Mitigations: on-chain reputation from collect/revoke history; the LP discount already prices collection risk.
- Demo token is a plain 6-decimal SPL mint with a centralized authority — fine for a devnet demo, irrelevant to the program logic.

## Roadmap

- KSeF (Polish e-invoicing) import → auto-create invoices from official e-invoice XML
- On-chain collection bot (crank) for truly automatic collection
- Invoice reputation passport (paid/revoked/collected history)
- Token-2022 support with multiple delegates / transfer hooks
- Subscriptions-style recurring invoices

## License

MIT
