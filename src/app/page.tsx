import { redirect } from "next/navigation";
import { demoEnabled, getSession } from "@/lib/auth";
import Workspace from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Home() {
  const session = await getSession();
  const demo = demoEnabled();
  if (!session && !demo) redirect("/login");
  return (
    <Workspace
      name={session?.name ?? "Tu espacio"}
      email={session?.email ?? ""}
      demo={!session}
    />
  );
}
