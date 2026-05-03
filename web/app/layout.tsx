import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import Link from "next/link";
import "./globals.css";
import { clerkEnabled } from "@/lib/clerk";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LeaseOS",
  description: "Lease abstraction and rent-review intelligence",
};

function Header() {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto max-w-7xl flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-semibold text-lg">LeaseOS</Link>
          <nav className="flex gap-4 text-sm text-neutral-600">
            <Link href="/leases" className="hover:text-neutral-900">Leases</Link>
            <Link href="/calendar" className="hover:text-neutral-900">Calendar</Link>
            <Link href="/comparables" className="hover:text-neutral-900">Comparables</Link>
            <Link href="/packs" className="hover:text-neutral-900">Packs</Link>
            <Link href="/integrations" className="hover:text-neutral-900">Integrations</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {clerkEnabled ? (
            <>
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button className="text-sm text-neutral-600 hover:text-neutral-900">
                    Sign in
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700">
                    Sign up
                  </button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <UserButton />
              </Show>
            </>
          ) : (
            <span className="text-xs text-neutral-400">dev mode · auth disabled</span>
          )}
        </div>
      </div>
    </header>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">
        {clerkEnabled ? (
          <ClerkProvider>
            <Header />
            <main className="flex-1">{children}</main>
          </ClerkProvider>
        ) : (
          <>
            <Header />
            <main className="flex-1">{children}</main>
          </>
        )}
      </body>
    </html>
  );
}
