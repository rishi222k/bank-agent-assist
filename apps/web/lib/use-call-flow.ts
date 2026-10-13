"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  AiResult,
  BriefingSummary,
  CallContext,
  CallStarted,
  ConfirmResult,
  DisputeCase,
  DisputeForm,
  ExtractedFacts,
  IssueType,
  ScenarioSummary,
  TransactionMatch,
  WrapUp,
} from "@baa/core";
import { api, ApiError } from "./api";

export type Stage = "verify" | "brief" | "listen" | "confirm" | "act" | "wrapup" | "done";

export const STAGES: { id: Exclude<Stage, "done">; label: string }[] = [
  { id: "verify", label: "Verify" },
  { id: "brief", label: "Brief" },
  { id: "listen", label: "Listen" },
  { id: "confirm", label: "Confirm" },
  { id: "act", label: "Act" },
  { id: "wrapup", label: "Wrap up" },
];

export type Speaker = "agent" | "customer";

/** A finished transcript segment. `at` is when the speaker started talking. */
export type Turn = { speaker: Speaker; text: string; at: string };

/**
 * The segment still being spoken. A streaming recogniser sends interim text that firms up into a
 * final result; the scripted call reveals words one at a time to look the same.
 */
export type InterimTurn = { index: number; speaker: Speaker; words: string[]; shown: number; at: string };

/** Playbooks built so far. The AI may suggest others; the agent can't pick them yet. */
export const AVAILABLE_ISSUE_TYPES: IssueType[] = ["unrecognised_charge"];

export const ISSUE_LABELS: Record<IssueType, string> = {
  unrecognised_charge: "Unrecognised charge",
  failed_transaction: "Failed transaction",
  fee_query: "Fee query",
  unknown: "Not clear yet",
};

const WORD_MS = 110;
const TURN_GAP_MS = 700;

const message = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong");

export function useCallFlow() {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [aiInfo, setAiInfo] = useState<{ provider: string; model: string | null } | null>(null);

  const [call, setCall] = useState<CallStarted | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [verify, setVerify] = useState<{ attemptsLeft: number; locked: boolean; error: string | null }>({
    attemptsLeft: 3,
    locked: false,
    error: null,
  });
  const [verified, setVerified] = useState(false);
  const [context, setContext] = useState<CallContext | null>(null);
  const [briefing, setBriefing] = useState<AiResult<BriefingSummary> | null>(null);

  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [interim, setInterim] = useState<InterimTurn | null>(null);
  const [playing, setPlaying] = useState(false);
  // A finished turn is being sent to the server (and analysed, for customer turns).
  const [sending, setSending] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [facts, setFacts] = useState<ExtractedFacts | null>(null);
  const [matches, setMatches] = useState<TransactionMatch[]>([]);
  const [extractError, setExtractError] = useState<string | null>(null);

  const [chosenIssueType, setChosenIssueType] = useState<IssueType | null>(null);
  const [selectedTxnId, setSelectedTxnId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState<ConfirmResult | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [createdCase, setCreatedCase] = useState<DisputeCase | null>(null);
  const idempotencyKey = useRef<string>("");

  const [wrapUp, setWrapUp] = useState<AiResult<WrapUp> | null>(null);
  const [wrapUpRequested, setWrapUpRequested] = useState(false);
  const [ended, setEnded] = useState(false);
  const [auditVersion, setAuditVersion] = useState(0);

  const callIdRef = useRef<string | null>(null);
  // Index of the last script turn committed, so an effect re-run can't send a turn twice.
  const committedRef = useRef(-1);

  useEffect(() => {
    api
      .scenarios()
      .then((r) => {
        setScenarios(r.scenarios);
        setAiInfo(r.ai);
      })
      .catch((e) => toast.error(message(e)));
  }, []);

  const bumpAudit = () => setAuditVersion((v) => v + 1);

  const clear = useCallback(() => {
    callIdRef.current = null;
    committedRef.current = -1;
    setCall(null);
    setStartedAt(null);
    setVerify({ attemptsLeft: 3, locked: false, error: null });
    setVerified(false);
    setContext(null);
    setBriefing(null);
    setTranscript([]);
    setInterim(null);
    setPlaying(false);
    setSending(false);
    setAnalyzing(false);
    setFacts(null);
    setMatches([]);
    setExtractError(null);
    setChosenIssueType(null);
    setSelectedTxnId(null);
    setConfirming(false);
    setConfirmed(null);
    setSubmitting(false);
    setCreatedCase(null);
    setWrapUp(null);
    setWrapUpRequested(false);
    setEnded(false);
  }, []);

  /**
   * Shows an error. If the server no longer has the call (the sandbox expired or the server
   * restarted), the call can't continue, so the workspace starts over.
   */
  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.code === "call_not_found") {
        clear();
        toast.error("This demo call has expired. Start a new call.");
      } else toast.error(message(e));
    },
    [clear],
  );

  const startCall = useCallback(
    async (scenarioId: string) => {
      clear();
      try {
        const started = await api.startCall(scenarioId);
        callIdRef.current = started.callId;
        idempotencyKey.current = crypto.randomUUID();
        setCall(started);
        setVerify({
          ...started.verification,
          error: started.verification.locked
            ? "Too many failed attempts for this customer. Escalate to a team lead."
            : null,
        });
        setAiInfo(started.ai);
        setStartedAt(Date.now());
        bumpAudit();
      } catch (e) {
        fail(e);
      }
    },
    [clear, fail],
  );

  const submitVerification = useCallback(
    async (answer: { dob: string; last4: string }) => {
      if (!call) return;
      try {
        const r = await api.verify(call.callId, answer);
        bumpAudit();
        if (!r.verified) {
          setVerify({
            attemptsLeft: r.attemptsLeft,
            locked: r.locked,
            error: r.locked
              ? "Too many failed attempts for this customer. Escalate to a team lead."
              : "Details don't match our records.",
          });
          return;
        }
        setVerified(true);
        setVerify({ attemptsLeft: r.attemptsLeft, locked: false, error: null });
        const ctx = await api.context(call.callId);
        setContext(ctx);
        api
          .briefing(call.callId)
          .then(setBriefing)
          .catch((e) => fail(e));
      } catch (e) {
        if (e instanceof ApiError && e.code === "verification_locked")
          setVerify({ attemptsLeft: 0, locked: true, error: e.message });
        else fail(e);
      }
    },
    [call, fail],
  );

  // Scripted call playback, shaped like a streaming recogniser: each turn streams in word by word
  // (interim), then becomes final and is sent to the server, which analyses customer turns.
  const commitTurn = useCallback(
    async (turn: InterimTurn) => {
      const callId = callIdRef.current;
      if (!callId || committedRef.current >= turn.index) return;
      committedRef.current = turn.index;
      const final: Turn = { speaker: turn.speaker, text: turn.words.join(" "), at: turn.at };
      setInterim(null);
      setTranscript((t) => [...t, final]);
      setSending(true);
      if (turn.speaker === "customer") setAnalyzing(true);
      try {
        const r = await api.turn(callId, { speaker: final.speaker, text: final.text });
        if (callIdRef.current !== callId) return;
        if (r.analysis) {
          setFacts(r.analysis.facts);
          setMatches(r.analysis.matches);
          setExtractError(r.analysis.ai.ok ? null : r.analysis.ai.error);
          const top = r.analysis.matches[0];
          if (top) setSelectedTxnId((current) => current ?? top.transactionId);
        }
      } catch (e) {
        if (callIdRef.current !== callId) return;
        // The server never stored this turn: take it back off the screen so a retry resends it.
        committedRef.current = turn.index - 1;
        setTranscript((t) => t.slice(0, -1));
        setPlaying(false);
        fail(e);
      } finally {
        if (callIdRef.current === callId) {
          setSending(false);
          setAnalyzing(false);
        }
      }
    },
    [fail],
  );

  const startNextTurn = useCallback(
    (instant: boolean) => {
      if (!call || interim || sending) return;
      const index = transcript.length;
      const next = call.script[index];
      if (!next) return;
      const turn: InterimTurn = {
        index,
        speaker: next.speaker,
        words: next.text.split(/\s+/),
        shown: 0,
        at: new Date().toISOString(),
      };
      if (instant) void commitTurn(turn);
      else setInterim(turn);
    },
    [call, interim, sending, transcript.length, commitTurn],
  );

  // Reveal the interim turn word by word while playing; the last word makes it final.
  useEffect(() => {
    if (!interim || !playing) return;
    const t = setTimeout(() => {
      if (interim.shown + 1 >= interim.words.length) void commitTurn(interim);
      else setInterim({ ...interim, shown: interim.shown + 1 });
    }, WORD_MS);
    return () => clearTimeout(t);
  }, [interim, playing, commitTurn]);

  // Start the next turn once the previous one has been sent. Waiting on `sending` (state, not a ref)
  // means a slow AI response delays playback instead of stalling it.
  useEffect(() => {
    if (!playing || !call || interim || sending || transcript.length >= call.script.length) return;
    const t = setTimeout(() => startNextTurn(false), transcript.length === 0 ? 300 : TURN_GAP_MS);
    return () => clearTimeout(t);
  }, [playing, call, interim, sending, transcript.length, startNextTurn]);

  /** Finish the line being spoken, or play the next line in full. */
  const step = useCallback(() => {
    if (interim) void commitTurn(interim);
    else startNextTurn(true);
  }, [interim, startNextTurn, commitTurn]);

  const suggestedIssueType = facts?.suggestedIssueType ?? null;
  // The agent's choice wins; otherwise the AI's suggestion, if that playbook exists.
  const issueType =
    chosenIssueType ??
    (suggestedIssueType && AVAILABLE_ISSUE_TYPES.includes(suggestedIssueType) ? suggestedIssueType : null);

  const confirmTransaction = useCallback(async () => {
    if (!call || !selectedTxnId || !issueType) return;
    setConfirming(true);
    try {
      setConfirmed(await api.confirm(call.callId, { transactionId: selectedTxnId, issueType }));
      bumpAudit();
    } catch (e) {
      fail(e);
    } finally {
      setConfirming(false);
    }
  }, [call, selectedTxnId, issueType, fail]);

  const submitDispute = useCallback(
    async (form: DisputeForm) => {
      if (!call) return false;
      setSubmitting(true);
      try {
        const r = await api.createDispute({ callId: call.callId, idempotencyKey: idempotencyKey.current, form });
        setCreatedCase(r.case);
        toast.success(`Dispute ${r.case.reference} created`);
        // Refresh account data so the transaction list shows the new case.
        api
          .context(call.callId)
          .then(setContext)
          .catch(() => {});
        return true;
      } catch (e) {
        fail(e);
        return false;
      } finally {
        setSubmitting(false);
        bumpAudit();
      }
    },
    [call, fail],
  );

  const startWrapUp = useCallback(async () => {
    if (!call) return;
    setWrapUpRequested(true);
    setPlaying(false);
    setInterim(null);
    try {
      setWrapUp(await api.wrapUpDraft(call.callId));
    } catch (e) {
      fail(e);
    }
  }, [call, fail]);

  const saveWrapUp = useCallback(
    async (notes: string) => {
      if (!call) return;
      try {
        await api.saveWrapUp(call.callId, notes);
        setEnded(true);
        bumpAudit();
        toast.success("Notes saved. Call ended.");
      } catch (e) {
        fail(e);
      }
    },
    [call, fail],
  );

  const resetDemo = useCallback(async () => {
    try {
      await api.reset();
      clear();
      toast.success("Demo data reset");
    } catch (e) {
      fail(e);
    }
  }, [clear, fail]);

  const scriptDone = !!call && transcript.length >= call.script.length;

  const stage: Stage | null = !call
    ? null
    : ended
      ? "done"
      : wrapUpRequested
        ? "wrapup"
        : confirmed
          ? "act"
          : selectedTxnId && (matches.length > 0 || scriptDone)
            ? "confirm"
            : verified && (transcript.length > 0 || interim)
              ? "listen"
              : verified
                ? "brief"
                : "verify";

  return {
    scenarios,
    aiInfo,
    call,
    startedAt,
    stage,
    verify,
    verified,
    context,
    briefing,
    transcript,
    interim,
    // Playback stops by itself at the end of the script.
    playing: playing && !scriptDone,
    analyzing,
    scriptDone,
    facts,
    matches,
    extractError,
    issueType,
    suggestedIssueType,
    selectedTxnId,
    confirming,
    confirmed,
    submitting,
    createdCase,
    wrapUp,
    wrapUpRequested,
    ended,
    auditVersion,
    actions: {
      startCall,
      submitVerification,
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      step,
      selectIssueType: (t: IssueType) => !confirmed && setChosenIssueType(t),
      selectTransaction: (id: string) => !confirmed && setSelectedTxnId(id),
      confirmTransaction,
      submitDispute,
      startWrapUp,
      saveWrapUp,
      newCall: clear,
      resetDemo,
    },
  };
}

export type CallFlow = ReturnType<typeof useCallFlow>;
