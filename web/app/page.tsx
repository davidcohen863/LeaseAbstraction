import Link from "next/link";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold mb-4">LeaseOS</h1>
      <p className="text-neutral-600 mb-8">
        Upload a commercial lease, get every clause extracted with citations,
        and never miss a rent review or break notice again.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/leases"
          className="block rounded-lg border border-neutral-200 bg-white p-5 hover:border-neutral-300"
        >
          <div className="font-medium mb-1">Leases</div>
          <div className="text-sm text-neutral-500">Upload, review and approve.</div>
        </Link>
        <Link
          href="/calendar"
          className="block rounded-lg border border-neutral-200 bg-white p-5 hover:border-neutral-300"
        >
          <div className="font-medium mb-1">Calendar</div>
          <div className="text-sm text-neutral-500">All upcoming lease events.</div>
        </Link>
      </div>
    </div>
  );
}
