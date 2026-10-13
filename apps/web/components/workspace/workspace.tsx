"use client";

import { useState } from "react";
import { Sparkles, UserRound } from "lucide-react";
import { useCallFlow, type CallFlow } from "@/lib/use-call-flow";
import { cn } from "@/lib/utils";
import { AuditSheet } from "./audit-sheet";
import { ConversationPanel } from "./conversation-panel";
import { CopilotPanel } from "./copilot-panel";
import { CustomerPanel } from "./customer-panel";
import { EvidenceProvider } from "./evidence";
import { Header } from "./header";
import { PanelHeader } from "./kit";
import { StartScreen } from "./start-screen";
import { CompactStepper } from "./stepper";
import { VerifyPanel } from "./verify-panel";

export function Workspace() {
  const flow = useCallFlow();
  const [auditOpen, setAuditOpen] = useState(false);

  return (
    <EvidenceProvider refs={flow.context?.evidence ?? []}>
      <div className="flex h-dvh flex-col bg-surface">
        <Header flow={flow} onOpenAudit={() => setAuditOpen(true)} />
        {!flow.call || !flow.stage ? (
          <StartScreen flow={flow} />
        ) : (
          <>
            <div className="border-b bg-background px-4 py-2.5 xl:hidden">
              <CompactStepper stage={flow.stage} />
            </div>
            <main className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(300px,340px)] lg:overflow-hidden xl:grid-cols-[minmax(300px,360px)_minmax(0,1fr)_minmax(360px,420px)]">
              <Column className="lg:border-r">
                <PanelHeader
                  icon={UserRound}
                  title="Customer"
                  meta={flow.verified ? "Verified caller" : "Awaiting verification"}
                />
                <ColumnBody>{flow.verified ? <CustomerPanel flow={flow} /> : <VerifyPanel flow={flow} />}</ColumnBody>
              </Column>
              <Column className="h-[560px] bg-background lg:h-auto">
                <ConversationPanel flow={flow} />
              </Column>
              <Column className="lg:border-l">
                <PanelHeader icon={Sparkles} title="Co-pilot" meta={copilotMeta(flow)} />
                <ColumnBody>
                  <CopilotPanel flow={flow} />
                </ColumnBody>
              </Column>
            </main>
          </>
        )}
      </div>
      <AuditSheet
        callId={flow.call?.callId ?? null}
        version={flow.auditVersion}
        open={auditOpen}
        onOpenChange={setAuditOpen}
      />
    </EvidenceProvider>
  );
}

function Column({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("flex flex-col border-b lg:min-h-0 lg:border-b-0", className)}>{children}</section>;
}

function ColumnBody({ children }: { children: React.ReactNode }) {
  return <div className="p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">{children}</div>;
}

function copilotMeta(flow: CallFlow) {
  switch (flow.stage) {
    case "verify":
      return "Starts after verification";
    case "brief":
      return "Ready to listen";
    case "listen":
      return "Listening";
    case "confirm":
      return "Match found";
    case "act":
      return flow.createdCase ? "Case created" : "Recommendation ready";
    case "wrapup":
      return "Wrap-up";
    case "done":
      return "Call complete";
    default:
      return undefined;
  }
}
