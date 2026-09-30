"use client";

import { motion } from "framer-motion";
import { Loader2, Radio } from "lucide-react";

interface PreInterviewScreenProps {
  status: "start" | "resume";
  agentDisplayName: string;
  infoError: string | null;
  onBegin: () => void;
  starting: boolean;
}

// No camera/mic permission flow here on purpose — this build is a silent
// observer for an agent-vs-agent test session, so there's nothing local to
// request or preview. It only needs interview status from /api/air-info
// before it can enable the button.
export function PreInterviewScreen({
  status,
  agentDisplayName,
  infoError,
  onBegin,
  starting,
}: PreInterviewScreenProps) {
  const ready = !infoError;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="glass-panel w-full max-w-md rounded-3xl p-8"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-white/40">
          {status === "resume" ? "Resuming session" : "New test session"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white">
          {status === "resume" ? "Welcome back" : "Ready when you are"}
        </h1>
        <p className="mt-1 text-sm text-white/60">
          {agentDisplayName} and the test agent will join and talk to each
          other — you&apos;ll just be listening in.
        </p>

        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-black/30 px-5 py-4 text-sm text-white/60">
          <Radio className="h-5 w-5 shrink-0 text-[var(--accent)]" />
          <span>No camera or mic needed — this session is audio-only, listen mode.</span>
        </div>

        {infoError && (
          <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-2 text-center text-xs text-red-300">
            {infoError}
          </p>
        )}

        <motion.button
          whileTap={{ scale: 0.97 }}
          disabled={!ready || starting}
          onClick={onBegin}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {starting && <Loader2 className="h-4 w-4 animate-spin" />}
          {status === "resume" ? "Resume session" : "Start session"}
        </motion.button>
      </motion.div>
    </div>
  );
}
