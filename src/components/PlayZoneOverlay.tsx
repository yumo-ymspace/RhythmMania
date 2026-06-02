/**
 * @license
 * SPDX-License-Identifier: GPL-3.0-only
 */

import React from 'react';

interface PlayZoneOverlayProps {
  onExit: () => void;
  onToggleFocus: () => void;
  isFocusMode: boolean;
  score: number;
  accuracy: number;
}

export const PlayZoneOverlay: React.FC<PlayZoneOverlayProps> = ({
  onExit,
  onToggleFocus,
  isFocusMode,
  score,
  accuracy
}) => {
  return (
    <div 
      className="absolute top-0 left-0 right-0 z-40 pointer-events-none flex items-center justify-between px-6 py-5 bg-gradient-to-b from-[#050510]/80 to-transparent backdrop-blur-[1px]"
      style={{ zIndex: 40 }}
    >
      {/* Top Left Header Controls (Hidden on mobile of standard view to prevent clutter, as mobile controls are rendered at the bottom) */}
      <div className="hidden md:flex items-center gap-2.5 pointer-events-auto">
        <button
          id="back-btn"
          onClick={(e) => {
            e.stopPropagation();
            onExit();
          }}
          className="flex items-center text-slate-400 hover:text-rose-450 font-sans text-xs font-bold uppercase tracking-wider transition-all bg-[#08080C]/90 hover:bg-rose-950/15 px-4 py-2 rounded-xl border border-white/5 hover:border-rose-500/10 cursor-pointer"
        >
          ✕ Quit Performance
        </button>

        <button
          id="focus-toggle-btn"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFocus();
          }}
          className="flex items-center text-slate-350 hover:text-cyan-400 font-sans text-xs font-bold uppercase tracking-wider transition-all bg-[#08080C]/90 hover:bg-cyan-950/10 px-4 py-2 rounded-xl border border-white/5 hover:border-cyan-500/10 cursor-pointer"
        >
          {isFocusMode ? 'Normal View' : 'Focus Play'}
        </button>
      </div>

      {/* Floating circular close button for mobile focus mode */}
      {isFocusMode && (
        <div className="md:hidden flex items-center pointer-events-auto">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFocus();
            }}
            className="flex items-center justify-center text-cyan-400 hover:text-white bg-[#08080C]/80 font-sans text-[10px] font-extrabold uppercase tracking-wider px-3.5 py-1.5 rounded-full border border-white/10 active:bg-slate-900 cursor-pointer shadow-lg"
          >
            ✕ Exit Focus
          </button>
        </div>
      )}

      {/* Top Right Score & Accuracy HUD */}
      <div className="flex items-center gap-6 select-none">
        <div className="flex flex-col items-end">
          <span className="text-[9px] text-slate-500 font-sans tracking-widest font-extrabold uppercase">SCORE</span>
          <span className="text-xl sm:text-2xl font-black font-mono tracking-wider text-white">
            {score.toLocaleString('en-US', { minimumIntegerDigits: 7, useGrouping: false })}
          </span>
        </div>
        
        <div className="flex flex-col items-end">
          <span className="text-[9px] text-slate-500 font-sans tracking-widest font-extrabold uppercase">ACCURACY</span>
          <span className="text-xl sm:text-2xl font-black font-mono text-cyan-400">
            {accuracy.toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
};
