"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Bot, Camera, Loader2, Mic, Radio, User } from "lucide-react";
import type { InterviewMode } from "@/lib/types";

type PermissionState = "idle" | "checking" | "granted" | "denied";

interface PreInterviewScreenProps {
  status: "start" | "resume";
  agentDisplayName: string;
  infoError: string | null;
  mode: InterviewMode;
  onModeChange: (mode: InterviewMode) => void;
  onBegin: () => void;
  starting: boolean;
}

const MODES: { value: InterviewMode; label: string; icon: typeof Bot }[] = [
  { value: "auto", label: "Auto test", icon: Bot },
  { value: "manual", label: "Manual", icon: User },
];

export function PreInterviewScreen({
  status,
  agentDisplayName,
  infoError,
  mode,
  onModeChange,
  onBegin,
  starting,
}: PreInterviewScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Bumped whenever a pending camera request should be discarded (mode
  // switched back to auto, or the screen unmounted mid-request).
  const requestIdRef = useRef(0);
  const [permission, setPermission] = useState<PermissionState>("idle");
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const stopPreview = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const requestDevices = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setPermission("checking");
    setDeviceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (requestId !== requestIdRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      stopPreview();
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setPermission("granted");
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error("[pre-interview] getUserMedia failed", err);
      setPermission("denied");
      setDeviceError(
        err instanceof Error ? err.message : "Camera/microphone access was blocked."
      );
    }
  }, [stopPreview]);

  // Camera and mic are only touched in manual mode. Switching back to auto
  // (or leaving this screen) releases them, so the auto session never holds
  // your devices.
  useEffect(() => {
    if (mode !== "manual") return;
    const timeoutId = window.setTimeout(() => void requestDevices(), 0);
    return () => {
      window.clearTimeout(timeoutId);
      requestIdRef.current += 1;
      stopPreview();
      setPermission("idle");
    };
  }, [mode, requestDevices, stopPreview]);

  const ready = !infoError && (mode === "auto" || permission === "granted");

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="glass-panel w-full max-w-md rounded-3xl p-8"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-white/40">
          {status === "resume" ? "Resuming interview" : "New interview"}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white">
          {status === "resume" ? "Welcome back" : "Ready when you are"}
        </h1>

        {/* Mode switch — only before starting; it decides the whole session. */}
        <div
          role="radiogroup"
          aria-label="Interview mode"
          className="mt-6 grid grid-cols-2 gap-1 rounded-full bg-black/30 p-1"
        >
          {MODES.map(({ value, label, icon: Icon }) => {
            const selected = mode === value;
            return (
              <button
                key={value}
                role="radio"
                aria-checked={selected}
                disabled={starting}
                onClick={() => onModeChange(value)}
                className={`relative flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                  selected ? "text-white" : "text-white/50 hover:text-white/80"
                }`}
              >
                {selected && (
                  <motion.span
                    layoutId="mode-pill"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    className="absolute inset-0 rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)]"
                  />
                )}
                <Icon className="relative h-4 w-4" />
                <span className="relative">{label}</span>
              </button>
            );
          })}
        </div>

        <p className="mt-4 text-sm text-white/60">
          {mode === "auto"
            ? `${agentDisplayName} and the test agent will talk to each other — you'll just be listening in.`
            : `You'll answer ${agentDisplayName} yourself, with your mic and camera.`}
        </p>

        {mode === "auto" ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-black/30 px-5 py-4 text-sm text-white/60">
            <Radio className="h-5 w-5 shrink-0 text-[var(--accent)]" />
            <span>No camera or mic needed — audio-only, listen mode.</span>
          </div>
        ) : (
          <>
            <div className="relative mt-4 aspect-video w-full overflow-hidden rounded-2xl bg-black/40">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full scale-x-[-1] object-cover"
              />
              {permission !== "granted" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 px-6 text-center text-sm text-white/70">
                  {permission === "denied" ? (
                    <AlertTriangle className="h-6 w-6 text-amber-300" />
                  ) : (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  )}
                  <p className="max-w-[85%]">
                    {permission === "denied"
                      ? (deviceError ?? "Camera and microphone access is required.")
                      : "Requesting camera and microphone access…"}
                  </p>
                  {permission === "denied" && (
                    <button
                      onClick={() => void requestDevices()}
                      className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium text-white hover:bg-white/20"
                    >
                      Try again
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-center gap-6 text-xs text-white/60">
              <span className="flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5" />
                {permission === "granted" ? "Camera ready" : "Camera pending"}
              </span>
              <span className="flex items-center gap-1.5">
                <Mic className="h-3.5 w-3.5" />
                {permission === "granted" ? "Mic ready" : "Mic pending"}
              </span>
            </div>
          </>
        )}

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
          {status === "resume" ? "Resume interview" : "Start interview"}
        </motion.button>
      </motion.div>
    </div>
  );
}
