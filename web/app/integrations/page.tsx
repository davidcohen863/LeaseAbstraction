import { redirect } from "next/navigation";

// Old path lived here pre-Settings-hub. Keep a redirect so old bookmarks +
// the OAuth callback's `/integrations?connected=1` URL still land somewhere sensible.
export default async function IntegrationsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") qs.set(k, v);
  }
  redirect(`/settings/integrations${qs.toString() ? `?${qs.toString()}` : ""}`);
}
