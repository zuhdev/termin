<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project notes

- Next.js app in `app/`, Anchor program in `anchor/`, Codama-generated client in `app/generated/termin` — regenerate with `npm run codama:js`, never hand-edit.
- Commands: `npm run dev`, `npm run build`, `npm run lint`, `npm run ci` (build + lint + format:check), `cd anchor && cargo test` (LiteSVM tests).
- Devnet deploys must use `solana-verify build --library-name termin` (tag pinned to Solana 4.3.0 in `anchor/Cargo.toml` via `[workspace.metadata.cli]`); `anchor build -- --arch v0` is only for localnet/LiteSVM iteration.
- `.env.local` needs `NEXT_PUBLIC_DEMO_MINT`, written by `npm run demo:local` / `npm run demo:devnet`.
- On Windows, run Solana/Anchor CLI commands inside WSL (Ubuntu).
