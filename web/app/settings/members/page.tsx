import { Users } from "lucide-react";

// Multi-user invitations are deliberately deferred until Clerk Organisations
// is wired up (post-pilot). For now LeaseOS is single-tenant per firm.
export default function MembersPage() {
  return (
    <div>
      <header className="mb-4">
        <h2 className="text-lg font-semibold">Members</h2>
        <p className="text-sm text-neutral-500 mt-0.5">
          Invite teammates, set roles.
        </p>
      </header>

      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center">
        <div className="mx-auto h-10 w-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500">
          <Users size={18} />
        </div>
        <p className="mt-3 text-sm font-medium text-neutral-800">
          Multi-user workspaces — coming after the pilot
        </p>
        <p className="mt-1 text-sm text-neutral-500 max-w-md mx-auto">
          During the v1 pilot, LeaseOS runs as a single-tenant deployment per
          firm. Roles + invitations land once Clerk Organisations is wired up
          (~1 day of work, scheduled for post-pilot).
        </p>
        <a
          href="mailto:hello@leaseos.app?subject=Multi-user%20priority"
          className="mt-4 inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          Tell us this is blocking you
        </a>
      </div>
    </div>
  );
}
