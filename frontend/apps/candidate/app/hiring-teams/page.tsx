import { redirect } from "next/navigation";

// There is a SINGLE landing at `/`. The nav "For candidates | For hiring teams"
// switch toggles the two audiences in place (no navigation, no URL change) — there
// is no separate hiring landing page. This route is kept only so old/inbound links
// to /hiring-teams don't 404; it resolves to the one landing.
export default function HiringTeamsPage() {
  redirect("/");
}
