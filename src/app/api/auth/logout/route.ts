import { cookies } from "next/headers";
import {
  checkOrigin,
  cookieOptions,
  errorResponse,
  getSession,
} from "@/lib/auth";
import { oauthRequest } from "@/lib/oauth";
export async function POST(r: Request) {
  try {
    checkOrigin(r);
    const session = await getSession();
    const revoke = new URL(r.url).searchParams.get("revoke") === "true";
    let revoked = !revoke;
    if (revoke && session) {
      try {
        const res = await oauthRequest("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: session.refreshToken }),
        });
        revoked = res.ok;
      } catch {
        revoked = false;
      }
    }
    (await cookies()).set("mep_session", "", { ...cookieOptions, maxAge: 0 });
    (await cookies()).set("mep_oauth", "", { ...cookieOptions, maxAge: 0 });
    return Response.json({ ok: true, revoked });
  } catch (e) {
    return errorResponse(e);
  }
}
