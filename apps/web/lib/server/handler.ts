import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type z } from "zod";
import { AppError, getCallService, type CallService } from "@baa/core";

// M0 has no sign-in yet (M-02 lands in M1); every action is attributed to this agent.
export const DEMO_AGENT = "demo-agent";

type Ctx = { params: Promise<Record<string, string>> };

/**
 * Each visitor gets their own demo sandbox (calls, cases, audit log), keyed by a random ID in an
 * httpOnly cookie. It keeps visitors from seeing or resetting each other's demo; it is not sign-in.
 */
const SANDBOX_COOKIE = "baa_sandbox";
const SANDBOX_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError("bad_request", "Request body must be valid JSON");
  }
}

/** Wraps a route: gives it the visitor's call service, parses the body, and maps errors to JSON responses. */
export function route<S extends z.ZodType | undefined = undefined>(
  schema: S,
  fn: (args: {
    service: CallService;
    params: Record<string, string>;
    body: S extends z.ZodType ? z.infer<S> : undefined;
  }) => unknown | Promise<unknown>,
) {
  return async (req: NextRequest, ctx: Ctx) => {
    const existing = req.cookies.get(SANDBOX_COOKIE)?.value;
    const sandboxId = existing && SANDBOX_ID.test(existing) ? existing : randomUUID();
    const res = await handle(sandboxId, req, ctx);
    if (sandboxId !== existing)
      res.cookies.set(SANDBOX_COOKIE, sandboxId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 12,
      });
    return res;
  };

  async function handle(sandboxId: string, req: NextRequest, ctx: Ctx) {
    try {
      const body = schema ? schema.parse(await readJson(req)) : undefined;
      const result = await fn({ service: getCallService(sandboxId), params: await ctx.params, body: body as never });
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      if (err instanceof AppError)
        return NextResponse.json(
          { error: { code: err.code, message: err.message, details: err.details } },
          { status: err.status },
        );
      if (err instanceof ZodError)
        return NextResponse.json(
          { error: { code: "bad_request", message: err.issues[0]?.message ?? "Invalid request", details: err.issues } },
          { status: 400 },
        );
      console.error(err);
      return NextResponse.json({ error: { code: "internal", message: "Something went wrong" } }, { status: 500 });
    }
  }
}
