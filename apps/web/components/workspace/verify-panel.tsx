"use client";

import { useState } from "react";
import { Lock, PhoneIncoming, ShieldAlert, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CallFlow } from "@/lib/use-call-flow";
import { Eyebrow, KeyValue } from "./kit";

const DEMO = { dob: "1990-04-14", last4: "4242" };

export function VerifyPanel({ flow }: { flow: CallFlow }) {
  const [dob, setDob] = useState("");
  const [last4, setLast4] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { call, verify } = flow;
  if (!call) return null;

  return (
    <div className="space-y-3">
      {/* Incoming call */}
      <div className="rounded-lg border border-border bg-card p-3">
        <Eyebrow icon={PhoneIncoming} className="mb-2">
          Incoming
        </Eyebrow>
        <div className="font-mono text-[15px] font-semibold tracking-tight tabular-nums">{call.caller.phone}</div>
        <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-[13px]">
          <KeyValue label="Customer" className="text-[13px]">
            {call.caller.maskedName}
          </KeyValue>
          <KeyValue label="Card" className="text-[13px]">
            <span className="font-mono">{call.caller.maskedCard}</span>
          </KeyValue>
        </dl>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="size-3.5" /> Details hidden until verified
        </p>
      </div>

      {/* Verification form */}
      <div className="rounded-lg border border-border bg-card p-3">
        <Eyebrow className="mb-3">Verify caller</Eyebrow>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSubmitting(true);
            await flow.actions.submitVerification({ dob, last4 });
            setSubmitting(false);
          }}
        >
          <FieldGroup className="gap-3">
            <Field data-disabled={verify.locked || undefined}>
              <FieldLabel className="text-[13px]">Date of birth</FieldLabel>
              <Input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                disabled={verify.locked}
                required
                className="h-9 text-[13px]"
              />
            </Field>
            <Field data-disabled={verify.locked || undefined}>
              <FieldLabel className="text-[13px]">Card last 4</FieldLabel>
              <Input
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                placeholder="0000"
                className="h-9 font-mono text-[13px] tracking-widest"
                value={last4}
                onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
                disabled={verify.locked}
                required
              />
            </Field>

            {verify.error && (
              <Alert variant={verify.locked ? "destructive" : "warning"} className="py-2">
                <ShieldAlert className="size-4" />
                <AlertTitle className="text-[13px]">{verify.locked ? "Locked" : "Failed"}</AlertTitle>
                <AlertDescription className="text-[13px]">
                  {verify.error}
                  {!verify.locked && ` ${verify.attemptsLeft} attempt${verify.attemptsLeft === 1 ? "" : "s"} left.`}
                </AlertDescription>
              </Alert>
            )}
            {verify.locked && (
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={flow.actions.newCall}>
                End call
              </Button>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="submit"
                  size="sm"
                  className="w-full gap-1.5"
                  disabled={verify.locked || submitting || dob === "" || last4.length !== 4}
                >
                  {submitting ? <Spinner className="size-3.5" /> : <ShieldCheck className="size-4" />}
                  Verify
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Verify caller <Kbd>Enter</Kbd>
              </TooltipContent>
            </Tooltip>
          </FieldGroup>
        </form>
      </div>

      {/* Demo helper */}
      <div className="flex items-center justify-between rounded-lg border border-dashed border-border px-3 py-2 text-[13px] text-muted-foreground">
        <span className="flex flex-wrap items-center gap-1">
          Demo <Kbd className="h-5 text-[11px]">{DEMO.dob}</Kbd> <Kbd className="h-5 text-[11px]">{DEMO.last4}</Kbd>
        </span>
        <Button
          variant="ghost"
          size="xs"
          className="h-6 px-2 text-[11px]"
          disabled={verify.locked}
          onClick={() => {
            setDob(DEMO.dob);
            setLast4(DEMO.last4);
          }}
        >
          Fill
        </Button>
      </div>
    </div>
  );
}
