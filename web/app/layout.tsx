import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider, Show, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import "./globals.css";
import { clerkEnabled } from "@/lib/clerk";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LeaseOS",
  description: "Lease abstraction and rent-review intelligence",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">
        <header className="border-b border-neutral-200 bg-white">
          <div className="mx-auto max-w-7xl flex items-center justify-between px-6 py-3">
            <div className="flex items-center gap-6">
              <Link href="/" className="font-semibold text-lg">LeaseOS</Link>
              <nav className="flex gap-4 text-sm text-neutral-600">
                <Link href="/leases" className="hover:text-neutral-900">Leases</Link>
                <Link href="/calendar" className="hover:text-neutral-900">Calendar</Link>
                <Link href="/integrations" className="hover:text-neutral-900">Integrations</Link>
              </nav>
            </div>
            <div className="flex items-center gap-3">
              {clerkEnabled ? (
                <>
                  <Show when="signed-in"><UserButton /></Show>
                  <Show when="signed-out">
                    <Link href="/sign-in" className="text-sm text-neutral-600 hover:text-neutral-900">
                      Sign in
                    </Link>
                  </Show>
                </>
              ) : (
                <span className="text-xs text-neutral-400">dev mode · auth disabled</span>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  if (clerkEnabled) {
    return (
      <ClerkProvider>
        <Shell>{children}</Shell>
      </ClerkProvider>
    );
  }
  return <Shell>{children}</Shell>;
}
