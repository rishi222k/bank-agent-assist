"use client";

import { useState } from "react";
import { Lock, PhoneIncoming, ShieldAlert, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
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
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <Eyebrow icon={PhoneIncoming}>Incoming call</Eyebrow>
          <CardTitle className="font-mono text-lg tracking-tight tabular-nums">{call.caller.phone}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2">
            <KeyValue label="Matched customer">{call.caller.maskedName}</KeyValue>
            <KeyValue label="Card">{call.caller.maskedCard}</KeyValue>
          </dl>
          <p className="mt-3 flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
            <Lock className="size-3.5" /> Account details stay hidden until the caller is verified.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verify the caller</CardTitle>
          <CardDescription>Ask for their date of birth and the last 4 digits of their card.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              await flow.actions.submitVerification({ dob, last4 });
              setSubmitting(false);
            }}
          >
            <FieldGroup className="gap-4">
              <Field data-disabled={verify.locked || undefined}>
                <FieldLabel htmlFor="dob">Date of birth</FieldLabel>
                <Input
                  id="dob"
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  disabled={verify.locked}
                  required
                />
              </Field>
              <Field data-disabled={verify.locked || undefined}>
                <FieldLabel htmlFor="last4">Card, last 4 digits</FieldLabel>
                <Input
                  id="last4"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  placeholder="0000"
                  className="font-mono tracking-widest"
                  value={last4}
                  onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
                  disabled={verify.locked}
                  required
                />
              </Field>

              {verify.error && (
                <Alert variant={verify.locked ? "destructive" : "warning"}>
                  <ShieldAlert />
                  <AlertTitle>{verify.locked ? "Verification locked" : "Not verified"}</AlertTitle>
                  <AlertDescription>
                    {verify.error}
                    {!verify.locked && ` ${verify.attemptsLeft} attempt${verify.attemptsLeft === 1 ? "" : "s"} left.`}
                  </AlertDescription>
                </Alert>
              )}
              {verify.locked && (
                <Button type="button" variant="outline" onClick={flow.actions.newCall}>
                  End call
                </Button>
              )}

              <Button type="submit" disabled={verify.locked || submitting || dob === "" || last4.length !== 4}>
                {submitting ? <Spinner /> : <ShieldCheck />}
                Verify caller
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
        <span className="flex flex-wrap items-center gap-1">
          Demo answers <Kbd>{DEMO.dob}</Kbd> <Kbd>{DEMO.last4}</Kbd>
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={verify.locked}
          onClick={() => {
            setDob(DEMO.dob);
            setLast4(DEMO.last4);
          }}
        >
          Fill in
        </Button>
      </div>
    </div>
  );
}
