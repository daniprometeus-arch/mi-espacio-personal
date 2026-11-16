import { listBackups, readBackup } from "@/lib/backups";
import { errorResponse, requireSession } from "@/lib/auth";
export const dynamic = "force-dynamic";
export async function GET(r: Request) {
  try {
    await requireSession();
    const id = new URL(r.url).searchParams.get("id");
    return Response.json(
      id ? { state: await readBackup(id) } : { backups: await listBackups() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
