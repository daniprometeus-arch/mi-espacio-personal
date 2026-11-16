import { cookies } from "next/headers";
import { cookieOptions, errorResponse, seal, appUrl } from "@/lib/auth";
import { createOAuthFlow } from "@/lib/oauth";
export async function GET(request: Request) {
  try {
    const flow = createOAuthFlow();
    const origin = appUrl();
    // La cookie de estado y el callback deben pertenecer al mismo dominio estable.
    if (new URL(request.url).origin !== origin)
      return Response.redirect(`${origin}/api/auth/login`);
    (await cookies()).set("mep_oauth", seal(flow.pending), {
      ...cookieOptions,
      maxAge: 600,
    });
    return Response.redirect(flow.url);
  } catch (error) {
    return errorResponse(error);
  }
}
