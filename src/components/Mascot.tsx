/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from "motion/react";

export type MascotState = "chat" | "narrator" | "serious" | "greeting" | "recruitment";

interface MascotProps {
  state: MascotState;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  speechBubble?: string;
}

const MASCOT_URLS: Record<MascotState, string> = {
  chat: "https://i.ibb.co/k68Ls3Fn/RR6.png",
  narrator: "https://i.ibb.co/kZf1Vt5/RR5.png",
  serious: "https://i.ibb.co/B5hb87Qz/RR4.png",
  greeting: "https://i.ibb.co/1GqTNLY8/RR3.png",
  recruitment: "https://i.ibb.co/FkP8MgVf/RR2.png",
};

const SIZE_CLASSES = {
  sm: "w-16 h-16",
  md: "w-28 h-28 md:w-32 md:h-32",
  lg: "w-40 h-40 md:w-48 md:h-48",
  xl: "w-52 h-52 md:w-64 md:h-64",
};

export default function Mascot({ state, size = "md", className = "", speechBubble }: MascotProps) {
  const imageUrl = MASCOT_URLS[state] || MASCOT_URLS.greeting;

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      {/* Speech Bubble above mascot if provided */}
      {speechBubble && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 bg-white text-[#1A1A1A] text-sm font-medium px-4 py-3 rounded-2xl shadow-lg border border-[#DBDBDB] relative max-w-xs text-center leading-relaxed"
        >
          <p>{speechBubble}</p>
          <div className="absolute w-3 h-3 bg-white border-r border-b border-[#DBDBDB] bottom-[-6px] left-1/2 transform -translate-x-1/2 rotate-45"></div>
        </motion.div>
      )}

      {/* Mascot Image with gold glow aura wrapper */}
      <div className="relative">
        {/* Golden glow aura behind mascot */}
        <div className="absolute inset-0 bg-gradient-to-tr from-[#F4EE8E] to-[#D99E41] opacity-20 blur-2xl rounded-full scale-125 z-0 animate-pulse"></div>

        {/* Animated Mascot */}
        <motion.img
          src={imageUrl}
          alt={`Робот Рекрутер - ${state}`}
          className={`relative z-10 ${SIZE_CLASSES[size]} object-contain drop-shadow-md`}
          referrerPolicy="no-referrer"
          animate={{
            y: [0, -8, 0],
          }}
          transition={{
            duration: 3.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>
    </div>
  );
}
