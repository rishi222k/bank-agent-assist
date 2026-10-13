import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { AppError, getCallService, type CallService } from "@baa/core";

// M0 has no sign-in yet (M-02 lands in M1); every action is attributed to this agent.
export const DEMO_AGENT = "demo-agent";

type Ctx = { params: Promise<Record<string, string>> };

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError("bad_request", "Request body must be valid JSON");
  }
}

/** Wraps a route: gives it the call service, parses the body, and maps errors to JSON responses. */
export function route<S extends z.ZodType | undefined = undefined>(
  schema: S,
  fn: (args: {
    service: CallService;
    params: Record<string, string>;
    body: S extends z.ZodType ? z.infer<S> : undefined;
  }) => unknown | Promise<unknown>,
) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const body = schema ? schema.parse(await readJson(req)) : undefined;
      const result = await fn({ service: getCallService(), params: await ctx.params, body: body as never });
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
  };
}
