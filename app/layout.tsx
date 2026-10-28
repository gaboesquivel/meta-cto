import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/providers/query-provider";

import "@/styles/globals.css";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";

export const metadata: Metadata = {
  description: "MCP-first agentic application starter.",
  title: "meta-cto",
};

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", inter.variable)}
    >
      <body>
        <NuqsAdapter>
          <QueryProvider>
            <ThemeProvider>{children}</ThemeProvider>
          </QueryProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
