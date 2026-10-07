"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { AirInfoResponse, InterviewMode, TokenResponse } from "@/lib/types";
import { PreInterviewScreen } from "./PreInterviewScreen";
import { CallScreen } from "./CallScreen";
import { ManualCallScreen } from "./ManualCallScreen";
import { EndScreen } from "./EndScreen";

type Phase = "loading" | "pre-interview" | "call" | "ended" | "fatal";

interface InterviewAppProps {
  candidateId: string;
  jobId: string;
}

export function InterviewApp({ candidateId, jobId }: InterviewAppProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [info, setInfo] = useState<AirInfoResponse | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [connection, setConnection] = useState<TokenResponse | null>(null);
  const [fatalMessage, setFatalMessage] = useState<string | null>(null);
  // Chosen on the pre-interview screen; fixed once the session starts
  // (the token response echoes it back as connection.mode).
  const [mode, setMode] = useState<InterviewMode>("auto");

  const loadInfo = useCallback(async () => {
    if (!candidateId || !jobId) {
      setFatalMessage(
        "This interview link is missing candidateId or jobId in the URL query params."
      );
      setPhase("fatal");
      return;
    }
    setPhase("loading");
    setInfoError(null);
    try {
      const res = await fetch(
        `/api/air-info?candidateId=${encodeURIComponent(candidateId)}&jobId=${encodeURIComponent(jobId)}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as AirInfoResponse & { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "Could not load interview status.");
      }
      setInfo(data);
      setPhase("pre-interview");
    } catch (err) {
      console.error("[interview-app] /api/air-info failed", err);
      setInfoError(
        err instanceof Error ? err.message : "Could not load interview status."
      );
      setPhase("pre-interview");
    }
  }, [candidateId, jobId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadInfo();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadInfo]);

  const handleBegin = useCallback(async () => {
    setStarting(true);
    setInfoError(null);
    try {
      const res = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId,
          jobId,
          pipelineId: info?.pipelineId,
          sessionContext: info?.sessionContext,
          introMessage: info?.introMessage,
          exitMessage: info?.exitMessage,
          persona: info?.persona,
          language: info?.language,
          candidateName: info?.candidateName,
          jobName: info?.jobName,
          clientName: info?.clientName,
          // Only present on "resume" — tells the BFF to rejoin this exact
          // room instead of generating a brand new one.
          roomName: info?.roomName,
          mode,
        }),
      });
      const data = (await res.json()) as TokenResponse & { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "Could not set up the LiveKit room.");
      }
      setConnection(data);
      setPhase("call");
    } catch (err) {
      console.error("[interview-app] failed to start room", err);
      setInfoError(
        err instanceof Error ? err.message : "Could not start the interview."
      );
    } finally {
      setStarting(false);
    }
  }, [candidateId, jobId, info, mode]);

  const handleEnded = useCallback(() => {
    setConnection(null);
    setPhase("ended");
  }, []);

  if (phase === "fatal") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-300" />
        <p className="max-w-sm text-sm text-white/70">{fatalMessage}</p>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-white/60" />
        <p className="text-sm text-white/50">Checking interview status…</p>
      </div>
    );
  }

  const agentDisplayName = info?.agentName ?? info?.persona ?? "AI Recruiter";

  if (phase === "call" && connection) {
    if (connection.mode === "manual") {
      return (
        <ManualCallScreen
          serverUrl={connection.serverUrl}
          token={connection.token}
          agentDisplayName={agentDisplayName}
          onEnded={handleEnded}
        />
      );
    }
    if (connection.test) {
      return (
        <CallScreen
          recruiter={{
            serverUrl: connection.serverUrl,
            token: connection.token,
            roomName: connection.roomName,
          }}
          tester={{ serverUrl: connection.test.serverUrl, token: connection.test.token }}
          agentDisplayName={agentDisplayName}
          onEnded={handleEnded}
        />
      );
    }
  }

  if (phase === "ended") {
    return <EndScreen />;
  }

  return (
    <PreInterviewScreen
      status={info?.status ?? "start"}
      agentDisplayName={agentDisplayName}
      infoError={infoError}
      mode={mode}
      onModeChange={setMode}
      onBegin={handleBegin}
      starting={starting}
    />
  );
}
