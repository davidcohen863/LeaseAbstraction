import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { clerkEnabled } from "@/lib/clerk";
import { Sidebar } from "@/components/nav/sidebar";
import { Topbar } from "@/components/nav/topbar";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmHost } from "@/components/ui/confirm-dialog";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LeaseOS",
  description: "Lease abstraction and rent-review intelligence",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-neutral-50 text-neutral-900">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
      <ConfirmHost />
    </ToastProvider>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-neutral-50 text-neutral-900">
        {clerkEnabled ? (
          <ClerkProvider>
            <Shell>{children}</Shell>
          </ClerkProvider>
        ) : (
          <Shell>{children}</Shell>
        )}
      </body>
    </html>
  );
}
