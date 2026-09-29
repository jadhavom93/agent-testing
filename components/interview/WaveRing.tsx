"use client";

import { motion, AnimatePresence } from "framer-motion";

interface WaveRingProps {
  active: boolean;
  color?: string;
}

const RING_COUNT = 3;

export function WaveRing({ active, color = "rgba(124, 158, 255, 0.55)" }: WaveRingProps) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <AnimatePresence>
        {active &&
          Array.from({ length: RING_COUNT }).map((_, i) => (
            <motion.span
              key={i}
              initial={{ scale: 0.85, opacity: 0.6 }}
              animate={{ scale: 1.6, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 1.8,
                ease: "easeOut",
                repeat: Infinity,
                delay: i * 0.5,
              }}
              className="absolute h-full w-full rounded-full border-2"
              style={{ borderColor: color }}
            />
          ))}
      </AnimatePresence>
    </div>
  );
}
