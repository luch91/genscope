import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GenScope — 3D GenLayer Block Explorer",
  description:
    "Real-time 3D block explorer for GenLayer Testnet Bradbury. Visualize blocks, transactions, and AI consensus in 3D.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={jetBrainsMono.variable}>
      <body
        style={{
          margin: 0,
          padding: 0,
          background: "#080810",
          color: "#fff",
          overflow: "hidden",
          fontFamily: "var(--font-jetbrains-mono), monospace",
        }}
      >
        {children}
      </body>
    </html>
  );
}
