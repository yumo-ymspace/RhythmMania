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

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings as SettingsIcon, Play, MousePointer2 } from 'lucide-react';
import metadata from '../../metadata.json';

export const MainMenu = ({ onNavigate, onOpenSettings }: { onNavigate: (screen: 'select' | 'history') => void, onOpenSettings: () => void }) => {
  const bgImages = ['Arushii.jpg', 'Ferineon.jpg', 'Kourihase.png', 'MPDisplay.png', 'nikio.png'];
  const [bg, setBg] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);

  useEffect(() => {
    setBg('/backgrounds/' + bgImages[Math.floor(Math.random() * bgImages.length)]);
  }, []);

  if (!bg) return null;

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden flex items-center justify-center bg-black">
      {/* Background with zoom animation */}
      <motion.img 
        initial={{ scale: 1.1, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.6 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        src={bg} 
        className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none" 
      />

      {/* Triangles overhead */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent z-0 pointer-events-none" />
      
      {/* Main UI */}
      <div className="z-10 flex flex-col items-center relative w-full px-4 mt-8">
        
        <div className="relative flex items-center justify-center w-full max-w-4xl min-h-[350px]">
          
          <AnimatePresence>
            {showOptions && (
              <motion.div
                initial={{ opacity: 0, x: -50, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -50, scale: 0.9 }}
                className="absolute right-[55%] md:right-[50%] md:mr-44 flex flex-col gap-4 text-right z-20"
              >
                <button 
                  onClick={(e) => { e.stopPropagation(); onNavigate('select'); }}
                  className="px-6 py-4 bg-[#e6005c]/90 hover:bg-[#ff1a75]/90 border border-[#ff80a5]/50 hover:border-[#ff80a5] text-white font-sans font-black text-xl italic tracking-wider rounded-l-full shadow-[0_0_15px_rgba(230,0,92,0.5)] transition-all flex items-center gap-2 justify-end"
                >
                  Mania
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showOptions && (
              <motion.div
                initial={{ opacity: 0, x: 50, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 50, scale: 0.9 }}
                className="absolute left-[55%] md:left-[50%] md:ml-44 flex flex-col gap-4 text-left z-20"
              >
                <button 
                  onClick={(e) => { e.stopPropagation(); onOpenSettings(); }}
                  className="px-6 py-4 bg-slate-800/90 hover:bg-slate-700/90 border border-slate-500/50 hover:border-slate-400 text-white font-sans font-black text-xl italic tracking-wider rounded-r-full shadow-lg transition-all flex items-center gap-2"
                >
                  <SettingsIcon className="w-5 h-5" /> Settings
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); onNavigate('history'); }}
                  className="px-6 py-4 bg-indigo-900/90 hover:bg-indigo-800/90 border border-indigo-500/50 hover:border-indigo-400 text-white font-sans font-black text-xl italic tracking-wider rounded-r-full shadow-[0_0_15px_rgba(79,70,229,0.5)] transition-all flex items-center gap-2"
                >
                  <MousePointer2 className="w-5 h-5" /> History
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* MAIN CENTER CIRCLE */}
          <motion.div 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowOptions(!showOptions)}
            className="w-64 h-64 md:w-80 md:h-80 rounded-full bg-[#ff4da6]/10 backdrop-blur-md justify-center flex items-center flex-col cursor-pointer border-[8px] border-white/20 shadow-[0_0_60px_rgba(255,77,166,0.5)] relative hover:border-white/40 hover:shadow-[0_0_80px_rgba(255,77,166,0.7)] group transition-all duration-300 z-30"
          >
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#ff1a75]/50 to-transparent pointer-events-none group-hover:from-[#ff1a75]/70 transition-opacity" />
            <h1 className="text-5xl md:text-6xl font-black italic tracking-tighter text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] z-10 select-none text-center leading-[1.05]">
              Rhythm<br/>Mania
            </h1>
            <p className="mt-4 text-white/90 font-mono text-sm font-bold tracking-[0.3em] z-10 select-none drop-shadow">
              {metadata.version}
            </p>
          </motion.div>
          
        </div>

        {!showOptions && (
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-16 text-white/40 font-bold font-sans tracking-widest text-xs lg:text-sm uppercase animate-pulse select-none"
          >
            Click the circle to start
          </motion.p>
        )}

      </div>
    </div>
  );
};
