"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

export function EndScreen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 16 }}
        className="glass-panel flex h-24 w-24 items-center justify-center rounded-full"
      >
        <CheckCircle2 className="h-12 w-12 text-emerald-300" strokeWidth={1.5} />
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="mt-6 text-2xl font-semibold text-white"
      >
        Interview ended
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="mt-2 max-w-sm text-sm text-white/60"
      >
        Thanks for your time. You can close this tab now.
      </motion.p>
    </div>
  );
}
