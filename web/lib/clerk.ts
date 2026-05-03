/**
 * Clerk is optional in dev. If the publishable key isn't set we render
 * children as-is and skip the provider — the FastAPI backend's
 * LEASEOS_AUTH_REQUIRED=false default lets requests through unauthenticated.
 */
export const clerkEnabled = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
);
