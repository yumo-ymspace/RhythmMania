/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 *
 * This source code is licensed under the PolyForm Perimeter License 1.0.1.
 * You may modify and use this file for non-competing purposes, provided 
 * that open and explicit attribution is maintained.
 *
 * For the full license terms, see the LICENSE file in the root directory
 * from: https://github.com/yumo-ymspace/RhythmMania
 */

import React from 'react';
import type { GameSettings } from '../../types';
import { Settings2 } from 'lucide-react';

export default function SectionSkinPreview({ settings }: { settings: GameSettings }) {
  const playfieldStyle = settings.playfieldStyle || 'square';
  const circleNoteColor = settings.circleNoteColor || '#00b0ff';
  const circleReceptorColor = settings.circleReceptorColor || '#00b0ff';
  const rhythmplusColor = settings.rhythmplusColor || '#ffff00';
  const rhythmmaniaNoteColor = settings.rhythmmaniaNoteColor || '#00b0ff';
  const rhythmmaniaReceptorColor = settings.rhythmmaniaReceptorColor || '#00b0ff';
  
  return (
    <div className="border border-white/5 rounded-xl bg-[#08080C]/90 overflow-hidden mb-6 mt-2 relative shadow-skin-accent-glow">
      <div className="px-4 py-3 bg-black/40 border-b border-white/5 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded text-slate-400 bg-slate-900 flex items-center justify-center border border-white/10">
            <Settings2 size={10} />
          </div>
          <h3 className="text-sm font-black tracking-widest uppercase font-mono text-slate-200">Live Preview</h3>
        </div>
        <div className="flex items-center gap-2 px-2 py-1 rounded bg-skin-accent/20 border border-skin-accent/30">
          <div className="w-2 h-2 rounded-full bg-skin-accent animate-pulse" />
          <span className="text-[10px] font-bold text-skin-accent tracking-wider uppercase">Active</span>
        </div>
      </div>
      
      <div className="p-6 bg-black/60 flex justify-center">
        <div className={`relative flex flex-col items-center justify-center py-4 bg-slate-950/80 rounded-lg overflow-hidden border border-white/10 mx-auto shadow-2xl ${playfieldStyle === 'circle' ? 'h-[220px]' : 'h-[190px]'}`} style={{ width: '100%', maxWidth: '340px' }}>
          {/* 4-Lanes Playfield Track Container */}
          <div className="relative w-[180px] h-full border-l border-r border-slate-800 transition-all flex flex-col justify-between">
            {/* 3 Lane separator lines dividing the 4 lanes */}
            <div className="absolute inset-y-0 left-[25%] border-l border-dashed transition-colors duration-150" style={{ borderColor: `rgba(71,85,105,${settings.laneSeparatorOpacity ?? 0.30})` }} />
            <div className="absolute inset-y-0 left-[50%] border-l border-dashed transition-colors duration-150" style={{ borderColor: `rgba(71,85,105,${settings.laneSeparatorOpacity ?? 0.30})` }} />
            <div className="absolute inset-y-0 left-[75%] border-l border-dashed transition-colors duration-150" style={{ borderColor: `rgba(71,85,105,${settings.laneSeparatorOpacity ?? 0.30})` }} />

            {/* Stage Background Dim tint */}
            <div 
              className="absolute inset-0 bg-black pointer-events-none transition-all duration-150" 
              style={{ opacity: settings.backgroundDim ?? 0.60 }}
            />

            {/* Simulated Falling Notes at 75%, 50%, and 25% heights in different lanes */}
            {[
              { lane: 0, top: '15%' }, // Lane 1 (0-25%), 75%+ high
              { lane: 3, top: '45%' }, // Lane 4 (75-100%), 50% high
              { lane: 2, top: '65%' }  // Lane 3 (50-75%), 25% high (heading to the active receptor)
            ].map((n, idx) => {
              return (
                <div 
                  key={idx}
                  className="absolute transition-all duration-150 flex flex-col items-center select-none pointer-events-none"
                  style={{ left: `${n.lane * 25}%`, width: '25%', top: n.top }}
                >
                  {playfieldStyle === 'circle' ? (
                    <div 
                      className="rounded-full border-2 border-white shadow-md transition-all animate-pulse"
                      style={{ 
                        opacity: settings.noteOpacity ?? 0.9,
                        width: `${30 * (settings.noteSizeMultiplier ?? 1.0)}px`,
                        height: `${30 * (settings.noteSizeMultiplier ?? 1.0)}px`,
                        backgroundColor: circleNoteColor,
                        boxShadow: `0 0 10px ${circleNoteColor}`
                      }}
                    />
                  ) : settings.squareRenderStyle === 'rhythmplus' ? (
                    <div 
                      className="h-2 w-full transition-all duration-150 rounded-none"
                      style={{ 
                        opacity: settings.noteOpacity ?? 1,
                        backgroundColor: rhythmplusColor,
                        boxShadow: `0 0 8px ${rhythmplusColor}`
                      }}
                    />
                  ) : (
                    <div 
                      className="h-4.5 rounded-md shadow-lg border-2 transition-all duration-150 w-[85%] bg-transparent"
                      style={{ 
                        opacity: settings.noteOpacity ?? 1,
                        borderColor: rhythmmaniaNoteColor,
                        boxShadow: `0 0 10px ${rhythmmaniaNoteColor}`
                      }}
                    />
                  )}
                </div>
              );
            })}

            {/* Performance Indicator Judgement text Overlay (Centered across playfield) */}
            <div 
              className="absolute left-0 right-0 z-20 flex flex-col items-center select-none pointer-events-none transition-all duration-150"
              style={{ 
                top: playfieldStyle === 'circle' ? '45px' : '48px',
                opacity: settings.judgementOpacity ?? 1.0,
                transform: `scale(${(settings.judgementSize ?? 1.0) * 0.75})` 
              }}
            >
              <span className="text-cyan-400 font-extrabold tracking-widest text-[10px] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] [text-shadow:0_0_8px_rgba(34,211,238,0.6)]">PERFECT</span>
              <span className="text-[12px] font-black tracking-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] -mt-1">142</span>
            </div>

            {/* Bottom Row of 4 Proportional Key Receptors */}
            <div className="absolute bottom-2 left-0 right-0 flex z-10 items-end h-[45px]">
              {[1, 2, 3, 4].map((col) => {
                const isLaneActive = false;
                let dimensionClasses = '';
                let styleClasses = '';
                let children = null;
                let activeStyles = {};

                if (playfieldStyle === 'circle') {
                  dimensionClasses = 'rounded-full';
                  styleClasses = isLaneActive 
                    ? 'border-3 border-white' 
                    : 'border border-dashed bg-transparent';
                  activeStyles = isLaneActive
                    ? {
                        backgroundColor: circleReceptorColor,
                        boxShadow: `0 0 10px ${circleReceptorColor}`,
                        width: `${30 * (settings.circleSize ?? 1.0)}px`, 
                        height: `${30 * (settings.circleSize ?? 1.0)}px`
                      }
                    : {
                        borderColor: circleReceptorColor,
                        width: `${30 * (settings.circleSize ?? 1.0)}px`, 
                        height: `${30 * (settings.circleSize ?? 1.0)}px`
                      };
                  children = isLaneActive && (
                    <div className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                  );
                } else {
                  if (settings.squareRenderStyle === 'rhythmplus') {
                    dimensionClasses = 'w-[90%] h-[3px]';
                    styleClasses = isLaneActive ? 'bg-white' : 'bg-white/40';
                    activeStyles = isLaneActive ? { boxShadow: '0 0 8px white' } : {};
                    children = null;
                  } else {
                    dimensionClasses = 'w-[85%] h-[18px]';
                    styleClasses = isLaneActive 
                      ? 'border-2 rounded-md' 
                      : 'border-2 rounded-md bg-slate-900/80';
                    activeStyles = isLaneActive 
                      ? { borderColor: rhythmmaniaReceptorColor, boxShadow: `0 0 10px ${rhythmmaniaReceptorColor}` } 
                      : { borderColor: rhythmmaniaReceptorColor };
                    children = isLaneActive ? (
                      <div className="w-1 h-1 bg-white rounded-full" />
                    ) : (
                      <div className="w-1 h-1 rounded-full" style={{ backgroundColor: rhythmmaniaReceptorColor }} />
                    );
                  }
                }

                return (
                  <div key={col} className="flex-1 flex justify-center items-end">
                    <div 
                      className={`${dimensionClasses} ${styleClasses} flex items-center justify-center transition-all duration-150`}
                      style={{ 
                        opacity: settings.receptorOpacity ?? 1,
                        ...activeStyles
                      }}
                    >
                      {children}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
