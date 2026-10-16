import { createSolanaRpc } from "@solana/kit";
import { fetchInvoices } from "../app/lib/termin";

async function main() {
  const rpc = createSolanaRpc("https://api.devnet.solana.com");
  const invoices = await fetchInvoices(rpc);

  console.log(`total invoices: ${invoices.length}\n`);
  for (const inv of invoices.sort((a, b) =>
    a.data.invoiceId < b.data.invoiceId ? -1 : 1
  )) {
    const d = inv.data;
    console.log(
      `${inv.address}  id=${d.invoiceId}  status=${d.status}  amount=${d.amount}  payer=${d.payer}`
    );
  }
}

main();
