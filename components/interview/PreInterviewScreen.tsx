"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, Mic, Loader2, AlertTriangle } from "lucide-react";

type PermissionState = "checking" | "granted" | "denied";

interface PreInterviewScreenProps {
  status: "start" | "resume";
  agentDisplayName: string;
  infoError: string | null;
  onBegin: () => void;
  starting: boolean;
}

export function PreInterviewScreen({
  status,
  agentDisplayName,
  infoError,
  onBegin,
  starting,
}: PreInterviewScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [permission, setPermission] = useState<PermissionState>("checking");
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const requestDevices = useCallback(async () => {
    setPermission("checking");
    setDeviceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setPermission("granted");
    } catch (err) {
      console.error("[pre-interview] getUserMedia failed", err);
      setPermission("denied");
      setDeviceError(
        err instanceof Error ? err.message : "Camera/microphone access was blocked."
      );
    }
  }, []);

  useEffect(() => {
    requestDevices();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [requestDevices]);

  const ready = permission === "granted" && !infoError;

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
        <p className="mt-1 text-sm text-white/60">
          {agentDisplayName} will join once you start.
        </p>

        <div className="relative mt-6 aspect-video w-full overflow-hidden rounded-2xl bg-black/40">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full scale-x-[-1] object-cover"
          />
          {permission !== "granted" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 px-6 text-center text-sm text-white/70">
              {permission === "checking" ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <AlertTriangle className="h-6 w-6 text-amber-300" />
              )}
              <p className="max-w-[85%]">
                {permission === "checking"
                  ? "Requesting camera and microphone access…"
                  : (deviceError ?? "Camera and microphone access is required.")}
              </p>
              {permission === "denied" && (
                <button
                  onClick={requestDevices}
                  className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium text-white hover:bg-white/20"
                >
                  Try again
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-center gap-6 text-xs text-white/60">
          <span className="flex items-center gap-1.5">
            <Camera className="h-3.5 w-3.5" />
            {permission === "granted" ? "Camera ready" : "Camera pending"}
          </span>
          <span className="flex items-center gap-1.5">
            <Mic className="h-3.5 w-3.5" />
            {permission === "granted" ? "Mic ready" : "Mic pending"}
          </span>
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
          {status === "resume" ? "Resume interview" : "Start interview"}
        </motion.button>
      </motion.div>
    </div>
  );
}
