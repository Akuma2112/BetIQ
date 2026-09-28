"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/** Subtle entrance for list items; disabled when the user prefers reduced motion. */
export function FadeIn({ children, index = 0 }: { children: ReactNode; index?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(index, 10) * 0.03 }}>
      {children}
    </motion.div>
  );
}
