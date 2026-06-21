import { env } from "@/lib/env";

export function authorizeCronRequest(req: Request): Response | null {
  if (!env.app.cronSecret) {
    if (process.env.NODE_ENV === "production") {
      return Response.json(
        { error: "Cron secret is not configured." },
        { status: 503 },
      );
    }
    return null;
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.app.cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
