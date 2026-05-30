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
      className="absolute top-0 left-0 right-0 z-40 pointer-events-none flex items-center justify-between px-4 sm:px-6 py-4 bg-gradient-to-b from-slate-950 to-transparent"
      style={{ zIndex: 40 }}
    >
      {/* Top Left Header Controls */}
      <div className="flex items-center gap-2 pointer-events-auto">
        <button
          id="back-btn"
          onClick={(e) => {
            e.stopPropagation(); // Stop click from propagating to canvas
            onExit();
          }}
          className="flex items-center gap-1.5 text-slate-400 hover:text-slate-100 font-sans text-xs font-semibold uppercase tracking-wider transition bg-slate-900/80 hover:bg-slate-800/80 px-3.5 py-1.5 rounded-lg border border-slate-800 cursor-pointer"
        >
          ✕ QUIT PERFORMANCE
        </button>

        <button
          id="focus-toggle-btn"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFocus();
          }}
          className="flex items-center gap-1.5 text-slate-300 hover:text-cyan-400 font-sans text-xs font-semibold uppercase tracking-wider transition bg-slate-900/80 hover:bg-slate-800/80 px-3.5 py-1.5 rounded-lg border border-slate-800 cursor-pointer"
        >
          <span>{isFocusMode ? 'Normal View' : 'Focus Play'}</span>
        </button>
      </div>

      {/* Top Right Score & Accuracy HUD */}
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-end">
          <span className="text-[9px] text-slate-500 font-sans tracking-widest font-black uppercase">SCORE</span>
          <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-slate-100">
            {score.toLocaleString('en-US', { minimumIntegerDigits: 7, useGrouping: false })}
          </span>
        </div>
        
        <div className="flex flex-col items-end">
          <span className="text-[9px] text-slate-500 font-sans tracking-widest font-black uppercase">ACCURACY</span>
          <span className="text-xl sm:text-2xl font-black font-mono text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.1)]">
            {accuracy.toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
};
