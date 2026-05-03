"use client";

import { clerkEnabled } from "@/lib/clerk";
import { useEffect, useState } from "react";

export default function ProfilePage() {
  // Lazy-import Clerk's UserProfile so this page renders fine when Clerk isn't configured.
  // Typed loosely on purpose — Clerk's component props aren't worth importing static
  // types for in a dynamic-import gate that may never resolve.
  const [UserProfile, setUserProfile] = useState<React.ComponentType<Record<string, unknown>> | null>(null);

  useEffect(() => {
    if (!clerkEnabled) return;
    let cancelled = false;
    void import("@clerk/nextjs").then((m) => {
      if (!cancelled) setUserProfile(() => m.UserProfile as unknown as React.ComponentType<Record<string, unknown>>);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!clerkEnabled) {
    return (
      <Section title="Profile" subtitle="Your account">
        <EmptyCard
          title="Sign-in not configured"
          body="Clerk is not enabled in this environment. The dev server bypasses auth — set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in .env to enable Clerk-managed profile, sign-out, and security settings."
        />
      </Section>
    );
  }

  return (
    <Section title="Profile" subtitle="Your account, managed by Clerk">
      <div className="rounded-lg border border-neutral-200 bg-white p-1 overflow-hidden">
        {UserProfile ? <UserProfile routing="hash" /> : <Loading />}
      </div>
    </Section>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <header className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-neutral-500 mt-0.5">{subtitle}</p>}
      </header>
      {children}
    </div>
  );
}

function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center">
      <p className="text-sm font-medium text-neutral-800">{title}</p>
      <p className="mt-1 text-sm text-neutral-500 max-w-md mx-auto">{body}</p>
    </div>
  );
}

function Loading() {
  return <div className="p-6 text-sm text-neutral-500">Loading…</div>;
}
