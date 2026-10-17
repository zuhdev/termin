import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "termin: console",
  description:
    "Issue, authorize, and collect self-collecting B2B invoices on Solana. Live on devnet.",
};

export default function AppSectionLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
