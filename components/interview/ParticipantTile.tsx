"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { MicOff } from "lucide-react";
import { WaveRing } from "./WaveRing";

interface ParticipantTileProps {
  label: string;
  sublabel?: string;
  speaking: boolean;
  muted?: boolean;
  videoElement?: ReactNode;
  avatarInitial?: string;
  accent?: "candidate" | "agent";
}

export function ParticipantTile({
  label,
  sublabel,
  speaking,
  muted,
  videoElement,
  avatarInitial,
  accent = "candidate",
}: ParticipantTileProps) {
  const ringColor =
    accent === "agent" ? "rgba(139, 92, 246, 0.6)" : "rgba(124, 158, 255, 0.6)";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex h-40 w-40 items-center justify-center sm:h-48 sm:w-48">
        <WaveRing active={speaking} color={ringColor} />
        <motion.div
          animate={{ scale: speaking ? 1.04 : 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="glass-panel relative flex h-full w-full items-center justify-center overflow-hidden rounded-full"
          style={{
            boxShadow: speaking
              ? `0 0 0 3px ${ringColor}`
              : "0 0 0 1px rgba(255,255,255,0.08)",
          }}
        >
          {videoElement ?? (
            <span className="text-4xl font-semibold text-white/80">
              {avatarInitial}
            </span>
          )}
          {muted && (
            <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60">
              <MicOff className="h-4 w-4 text-red-300" />
            </span>
          )}
        </motion.div>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-white/90">{label}</p>
        {sublabel && <p className="text-xs text-white/50">{sublabel}</p>}
      </div>
    </div>
  );
}
