import { redirect } from "next/navigation";

// /settings → first tab.
export default function SettingsIndex(): never {
  redirect("/settings/profile");
}
