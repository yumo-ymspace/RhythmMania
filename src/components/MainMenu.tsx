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
import { Settings as SettingsIcon, Play, History, Paintbrush, Loader2, Github, BookOpen, MessageSquareWarning } from 'lucide-react';
import metadata from '../../metadata.json';
import { AuthUser } from '../utils/authClient';
import type { GameSettings } from '../types';

const RESOURCE_LINKS = [
  { label: 'Discord', href: 'https://discord.rhythm-mania.com', icon: 'discord' },
  { label: 'Github', href: 'https://github.com/yumo-ymspace/RhythmMania', icon: Github },
  { label: 'Wiki', href: 'https://wiki.rhythm-mania.com', icon: BookOpen },
  { label: 'Bug Report', href: 'https://bug-report.rhythm-mania.com', icon: MessageSquareWarning },
] as const;

const DiscordIcon = ({ className = "h-5 w-5 sm:h-6 sm:w-6" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} fill-current`}>
    <path d="M19.54 4.86A16.9 16.9 0 0 0 15.4 3.57l-.5 1.02a15.6 15.6 0 0 0-5.8 0l-.5-1.02a16.9 16.9 0 0 0-4.14 1.29C1.84 8.73 1.13 12.5 1.48 16.2a16.7 16.7 0 0 0 5.1 2.58l1.23-1.65c-.68-.25-1.33-.56-1.94-.92l.47-.36c3.74 1.75 8.03 1.75 11.72 0l.48.36c-.62.36-1.27.67-1.95.92l1.23 1.65a16.7 16.7 0 0 0 5.1-2.58c.41-4.29-.7-8.02-3.38-11.34ZM8.5 14.03c-1.1 0-2-.99-2-2.2s.88-2.2 2-2.2c1.12 0 2.02.99 2 2.2 0 1.21-.88 2.2-2 2.2Zm7 0c-1.1 0-2-.99-2-2.2s.88-2.2 2-2.2c1.12 0 2.02.99 2 2.2s-.88 2.2-2 2.2Z" />
  </svg>
);

const ResourceLinks = () => (
  <nav aria-label="Community and support links" className="flex items-center gap-2">
    {RESOURCE_LINKS.map(({ label, href, icon: Icon }) => (
      <a
        key={label}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        title={label}
        className="group relative flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border border-white/10 bg-[#263449]/90 text-white/90 shadow-[0_4px_12px_rgba(0,0,0,0.28)] transition-all duration-150 hover:-translate-y-0.5 hover:border-white/25 hover:bg-[#344762] hover:text-white hover:shadow-[0_6px_16px_rgba(0,0,0,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/80"
      >
        {Icon === 'discord' ? <DiscordIcon /> : <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.2} />}
        <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#111827]/95 px-2 py-1 text-[10px] font-semibold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
          {label}
        </span>
      </a>
    ))}
  </nav>
);

export const MainMenu = ({
  onNavigate,
  onOpenSettings,
  settings,
  currentUser,
  authLoading,
  onSignIn,
  onSignOut,
  authError,
}: {
  onNavigate: (screen: 'select' | 'history' | 'skins' | 'profile') => void;
  onOpenSettings: () => void;
  settings: GameSettings;
  currentUser?: AuthUser | null;
  authLoading?: boolean;
  onSignIn?: () => void;
  onSignOut?: () => void;
  authError?: string | null;
}) => {
  const bgImages = [
    '- Y u m i J i-.webp',
    'Arushii.webp',
    'Ferineon.webp',
    'MPDisplay.webp',
    'PEALEERD_TAK.webp',
    'Porukana.webp',
    'RedcXca.webp',
    'Sm0llBanana.webp',
    'THICC Jeff.webp',
    'Triantafyllia.webp',
    'YellowX21.webp',
    'mimile1606.webp',
    'nikio.webp',
    'serr.webp',
    'soncak.webp',
    'wxyz.webp'
  ];
  const [bg, setBg] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const backgroundOpacity = 1 - (settings.menuBackgroundDim ?? 0.3);

  useEffect(() => {
    setBg('/backgrounds/' + bgImages[Math.floor(Math.random() * bgImages.length)]);
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!bg) return null;

  if (isMobile) {
    return (
      <div className="absolute inset-0 w-full h-full overflow-hidden flex flex-col bg-black">
        {/* Background with subtle zoom animation */}
        <motion.img 
          initial={{ scale: 1.05, opacity: 0 }}
          animate={{ scale: 1, opacity: backgroundOpacity }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          src={bg} 
          className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none" 
        />

        {/* Ambient bottom gradient shade */}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/95 via-black/40 to-transparent z-0 pointer-events-none" />

        {/* Outer Grid overlay for cohesive tech mood */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none z-0" />

        {/* Top Account Bar (Mobile) */}
        <div className="hidden absolute top-4 inset-x-4 z-40 pointer-events-auto items-center justify-between bg-black/70 backdrop-blur-md border border-white/10 rounded-2xl px-3.5 py-2 shadow-lg">
          {authLoading ? (
            <div className="flex items-center gap-2 text-white/70 text-xs font-mono uppercase">
              <Loader2 className="h-4 w-4 animate-spin text-pink-400" />
              <span>Loading account...</span>
            </div>
          ) : currentUser ? (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2.5">
                {currentUser.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt={currentUser.username} className="w-7 h-7 rounded-full border border-pink-500/50" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-pink-600/30 border border-pink-500/50 flex items-center justify-center text-pink-300 font-bold text-xs">
                    {currentUser.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex flex-col text-left">
                  <span className="text-white text-xs font-bold leading-tight">{currentUser.username}</span>
                  <span className="text-pink-400 text-[9px] font-mono leading-tight">Logged In</span>
                </div>
              </div>
              <button
                onClick={() => onNavigate('profile')}
                className="px-2.5 py-1 text-[10px] font-bold text-pink-200 hover:text-white bg-pink-500/15 hover:bg-pink-500/25 rounded-lg transition-colors cursor-pointer"
              >
                Profile
              </button>
              <button
                onClick={onSignOut}
                className="px-2.5 py-1 text-[10px] font-bold text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <div className="flex flex-col text-left">
                <span className="text-white/80 text-xs font-medium leading-tight">Guest Mode</span>
                <span className="text-white/40 text-[9px] font-mono leading-tight">Unsaved Online Stats</span>
              </div>
              <button
                onClick={onSignIn}
                className="px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                </svg>
                <span>Google Sign In</span>
              </button>
            </div>
          )}
        </div>

        {authError && (
          <div className="hidden absolute top-16 inset-x-4 z-40 bg-red-950/80 border border-red-500/50 text-red-200 text-xs px-3 py-2 rounded-xl text-center shadow-lg">
            {authError}
          </div>
        )}

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 pt-2 pb-[max(5.5rem,calc(4.5rem+env(safe-area-inset-bottom,0px)))] select-none h-full overflow-y-auto overflow-x-hidden">
          <div className="flex flex-col items-center justify-center gap-4 sm:gap-6 w-full my-auto">
            {/* Center Glowing Neon Circle */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: showOptions ? 0.88 : 1, opacity: 1 }}
              whileTap={{ scale: 0.84 }}
              transition={{ type: "spring", stiffness: 450, damping: 24 }}
              onClick={() => setShowOptions(!showOptions)}
              className="w-56 h-56 sm:w-64 sm:h-64 md:w-72 md:h-72 rounded-full flex flex-col items-center justify-center bg-[#ff4da6]/10 backdrop-blur-md border-[6px] sm:border-[8px] border-white/20 shadow-[0_0_50px_rgba(255,77,166,0.45)] active:border-white/40 active:shadow-[0_0_70px_rgba(255,77,166,0.65)] relative cursor-pointer group shrink-0"
            >
              {/* Inner ambient pulse */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#ff1a75]/50 to-transparent pointer-events-none" />
              
              <h1 className="text-4xl sm:text-5xl font-black italic tracking-tighter text-white text-center leading-[1.05] mt-1 sm:mt-2 select-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] z-10">
                Rhythm<br />Mania
              </h1>
              <p className="mt-2 text-white/90 font-mono text-[11px] sm:text-xs font-bold tracking-[0.2em] z-10 select-none drop-shadow">
                {metadata.version}
              </p>
            </motion.div>

            {/* Bottom slanted buttons - styled precisely like the reference image, positioned closer */}
            <div className="w-full max-w-[380px] sm:max-w-[420px] flex flex-col items-center min-h-[64px] sm:min-h-[76px] shrink-0">
              <AnimatePresence>
                {showOptions && (
                  <motion.div
                    initial={{ opacity: 0, y: 12, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 12, scale: 0.95 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="w-full flex items-center justify-between gap-2 sm:gap-3"
                  >
                    {/* Settings button */}
                    <button
                      onClick={() => onOpenSettings()}
                      className="flex-1 bg-[#4a5260]/85 hover:bg-[#525a69]/90 border border-white/20 rounded-xl py-2.5 sm:py-3.5 px-1.5 sm:px-2 flex flex-col items-center justify-center gap-1 -skew-x-[15deg] transition-all duration-150 active:scale-95 shadow-lg shadow-black/40 cursor-pointer"
                    >
                      <div className="skew-x-[15deg] flex flex-col items-center justify-center text-center">
                        <SettingsIcon className="w-4 h-4 sm:w-5 sm:h-5 text-white mb-0.5" />
                        <span className="text-white text-[10px] sm:text-[11px] font-bold font-sans tracking-wide">Settings</span>
                      </div>
                    </button>

                    {/* Mania button */}
                    <button
                      onClick={() => onNavigate('select')}
                      className="flex-1 bg-[#7e3ff2]/90 hover:bg-[#8d52ff]/95 border border-white/25 rounded-xl py-2.5 sm:py-3.5 px-1.5 sm:px-2 flex flex-col items-center justify-center gap-1 -skew-x-[15deg] transition-all duration-150 active:scale-95 shadow-lg shadow-purple-500/20 cursor-pointer"
                      style={{
                        boxShadow: '0 0 15px rgba(126, 63, 242, 0.35), 0 4px 12px rgba(0, 0, 0, 0.4)'
                      }}
                    >
                      <div className="skew-x-[15deg] flex flex-col items-center justify-center text-center">
                        <Play className="w-4 h-4 sm:w-5 sm:h-5 text-white fill-current mb-0.5" />
                        <span className="text-white text-[10px] sm:text-[11px] font-bold font-sans tracking-wide">Mania</span>
                      </div>
                    </button>

                    {/* Skin button */}
                    <button
                      onClick={() => onNavigate('skins')}
                      className="flex-1 bg-[#187b8f]/95 hover:bg-[#2097ad]/95 border border-white/25 rounded-xl py-2.5 sm:py-3.5 px-1.5 sm:px-2 flex flex-col items-center justify-center gap-1 -skew-x-[15deg] transition-all duration-150 active:scale-95 shadow-lg shadow-cyan-500/20 cursor-pointer"
                      style={{
                        boxShadow: '0 0 15px rgba(24, 123, 143, 0.35), 0 4px 12px rgba(0, 0, 0, 0.4)'
                      }}
                    >
                      <div className="skew-x-[15deg] flex flex-col items-center justify-center text-center">
                        <Paintbrush className="w-4 h-4 sm:w-5 sm:h-5 text-white mb-0.5" />
                        <span className="text-white text-[10px] sm:text-[11px] font-bold font-sans tracking-wide">Skin</span>
                      </div>
                    </button>

                    {/* History button */}
                    <button
                      onClick={() => onNavigate('history')}
                      className="flex-1 bg-[#c25e1a]/95 hover:bg-[#d66a20]/95 border border-white/25 rounded-xl py-2.5 sm:py-3.5 px-1.5 sm:px-2 flex flex-col items-center justify-center gap-1 -skew-x-[15deg] transition-all duration-150 active:scale-95 shadow-lg shadow-orange-500/20 cursor-pointer"
                      style={{
                        boxShadow: '0 0 15px rgba(194, 94, 26, 0.35), 0 4px 12px rgba(0, 0, 0, 0.4)'
                      }}
                    >
                      <div className="skew-x-[15deg] flex flex-col items-center justify-center text-center">
                        <History className="w-4 h-4 sm:w-5 sm:h-5 text-white mb-0.5" />
                        <span className="text-white text-[10px] sm:text-[11px] font-bold font-sans tracking-wide">History</span>
                      </div>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Bottom resources and legal notice on mobile */}
        <div className="absolute bottom-[max(0.75rem,calc(0.5rem+env(safe-area-inset-bottom,0px)))] inset-x-4 sm:inset-x-6 flex flex-col items-center gap-1 z-30 pointer-events-auto pb-[env(safe-area-inset-bottom,0px)]">
          <ResourceLinks />
          <p className="text-[9px] text-white/35 font-sans text-center max-w-[320px] leading-tight">
            By using RhythmMania, you acknowledge and agree to the{' '}
            <a href="/tos" className="text-white/50 hover:text-white underline transition-colors">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/privacypolicy" className="text-white/50 hover:text-white underline transition-colors">
              Privacy Policy
            </a>
            .
          </p>
        </div>

      </div>
    );
  }

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden flex items-center justify-center bg-black">
      {/* Background with zoom animation */}
      <motion.img 
        initial={{ scale: 1.1, opacity: 0 }}
        animate={{ scale: 1, opacity: backgroundOpacity }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        src={bg} 
        className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none" 
      />

      {/* Triangles overhead */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent z-0 pointer-events-none" />

      {/* Top Right Account Panel (Desktop) */}
      <div className="hidden absolute top-6 right-6 z-40 pointer-events-auto items-center gap-3 bg-black/70 backdrop-blur-md border border-white/10 rounded-2xl px-4 py-2.5 shadow-xl">
        {authLoading ? (
          <div className="flex items-center gap-2 text-white/70 text-xs font-mono uppercase">
            <Loader2 className="h-4 w-4 animate-spin text-pink-400" />
            <span>Loading account...</span>
          </div>
        ) : currentUser ? (
          <div className="flex items-center gap-3">
            {currentUser.avatarUrl ? (
              <img src={currentUser.avatarUrl} alt={currentUser.username} className="w-8 h-8 rounded-full border border-pink-500/50" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-pink-600/30 border border-pink-500/50 flex items-center justify-center text-pink-300 font-bold text-xs">
                {currentUser.username.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex flex-col text-left">
              <span className="text-white text-xs font-bold leading-tight">{currentUser.username}</span>
              <span className="text-pink-400 text-[10px] font-mono leading-tight">Logged In</span>
            </div>
            <button
              onClick={() => onNavigate('profile')}
              className="ml-1 px-3 py-1 text-xs font-bold text-pink-200 hover:text-white bg-pink-500/15 hover:bg-pink-500/25 rounded-xl transition-colors cursor-pointer"
            >
              Profile
            </button>
            <button
              onClick={onSignOut}
              className="ml-2 px-3 py-1 text-xs font-bold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex flex-col text-left">
              <span className="text-white/90 text-xs font-bold leading-tight">Guest Mode</span>
              <span className="text-white/50 text-[10px] font-mono leading-tight">Playing as Guest</span>
            </div>
            <button
              onClick={onSignIn}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 rounded-xl shadow-lg transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
              <span>Sign in with Google</span>
            </button>
          </div>
        )}
      </div>

      {authError && (
        <div className="hidden absolute top-20 right-6 z-40 bg-red-950/80 border border-red-500/50 text-red-200 text-xs px-3.5 py-2 rounded-xl text-center shadow-lg">
          {authError}
        </div>
      )}
      
      {/* Main UI */}
      <div className="z-10 absolute inset-0 overflow-hidden pointer-events-none">
        
        <motion.div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          {/* Horizontal Bar (shown when showOptions is true) */}
          <AnimatePresence>
            {showOptions && (
              <motion.div
                initial={{ clipPath: "inset(0 50% 0 50%)" }}
                animate={{ clipPath: "inset(0 0% 0 0%)" }}
                exit={{ clipPath: "inset(0 50% 0 50%)" }}
                transition={{ duration: 0.5, ease: [0.19, 1.0, 0.22, 1.0] }}
                className="absolute z-10 flex items-stretch pointer-events-auto h-20 md:h-28 transform -skew-x-[15deg]"
                style={{ width: '200vw' }}
              >
                {/* Left side black bar */}
                <div className="flex-1 bg-[#2b2b2b] border-y-[3px] border-black/30"></div>
                
                {/* Settings */}
                <button 
                  onClick={(e) => { e.stopPropagation(); onOpenSettings(); }}
                  className="w-32 md:w-48 bg-[#3d3d3d] hover:bg-[#4d4d4d] border-y-[3px] border-l-[3px] border-black/30 group transition-colors outline-none focus:outline-none -ml-[3px]"
                >
                  <div className="transform skew-x-[15deg] flex flex-col items-center justify-center h-full text-white group-hover:scale-110 transition-transform">
                    <SettingsIcon className="w-6 h-6 md:w-8 md:h-8 mb-1" />
                    <span className="font-sans font-bold text-sm md:text-base">settings</span>
                  </div>
                </button>
                
                {/* Spacer for circle */}
                <div className="w-[170px] md:w-[220px] bg-[#2b2b2b] border-y-[3px] border-black/30 border-l-[3px] relative -ml-[3px]"></div>
                
                {/* Mania */}
                <button 
                  onClick={(e) => { e.stopPropagation(); onNavigate('select'); }}
                  className="w-32 md:w-48 bg-[#724ec5] hover:bg-[#8561db] border-y-[3px] border-l-[3px] border-black/30 group transition-colors outline-none focus:outline-none -ml-[3px]"
                >
                  <div className="transform skew-x-[15deg] flex flex-col items-center justify-center h-full text-white group-hover:scale-110 transition-transform">
                    <Play className="w-6 h-6 md:w-8 md:h-8 mb-1 fill-current" />
                    <span className="font-sans font-bold text-sm md:text-base">mania</span>
                  </div>
                </button>

                {/* Skin */}
                <button 
                  onClick={(e) => { e.stopPropagation(); onNavigate('skins'); }}
                  className="w-32 md:w-48 bg-[#187b8f] hover:bg-[#2097ad] border-y-[3px] border-l-[3px] border-black/30 group transition-colors outline-none focus:outline-none -ml-[3px]"
                >
                  <div className="transform skew-x-[15deg] flex flex-col items-center justify-center h-full text-white group-hover:scale-110 transition-transform">
                    <Paintbrush className="w-6 h-6 md:w-8 md:h-8 mb-1" />
                    <span className="font-sans font-bold text-sm md:text-base">skin</span>
                  </div>
                </button>
                
                {/* History */}
                <button 
                  onClick={(e) => { e.stopPropagation(); onNavigate('history'); }}
                  className="w-32 md:w-48 bg-[#f4a100] hover:bg-[#ffb01f] border-y-[3px] border-l-[3px] border-black/30 group transition-colors outline-none focus:outline-none -ml-[3px]"
                >
                  <div className="transform skew-x-[15deg] flex flex-col items-center justify-center h-full text-white group-hover:scale-110 transition-transform">
                    <History className="w-6 h-6 md:w-8 md:h-8 mb-1" />
                    <span className="font-sans font-bold text-sm md:text-base">history</span>
                  </div>
                </button>
                
                {/* Right side black bar */}
                <div className="flex-1 bg-[#2b2b2b] border-y-[3px] border-l-[3px] border-black/30 -ml-[3px]"></div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* MAIN CENTER CIRCLE */}
          <motion.div 
            initial={{ x: 0 }}
            animate={{ x: showOptions ? (isMobile ? -64 : -192) : 0 }}
            transition={{ duration: 0.5, ease: [0.19, 1.0, 0.22, 1.0] }}
            className="absolute z-20 flex items-center justify-center pointer-events-none"
          >
            <motion.div 
              whileHover={{ scale: showOptions ? 0.85 : 1.05 }}
              whileTap={{ scale: showOptions ? 0.75 : 0.95 }}
              animate={{ scale: showOptions ? 0.8 : 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              onClick={() => setShowOptions(!showOptions)}
              className="w-64 h-64 md:w-80 md:h-80 rounded-full bg-[#ff4da6]/10 backdrop-blur-md justify-center flex items-center flex-col cursor-pointer border-[8px] border-white/20 shadow-[0_0_60px_rgba(255,77,166,0.5)] relative hover:border-white/40 hover:shadow-[0_0_80px_rgba(255,77,166,0.7)] group transition-colors transition-shadow duration-300 pointer-events-auto"
            >
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#ff1a75]/50 to-transparent pointer-events-none group-hover:from-[#ff1a75]/70 transition-opacity" />
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black italic tracking-tighter text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] z-10 select-none text-center leading-[1.05] mt-2">
                Rhythm<br/>Mania
              </h1>
              <p className="mt-2 text-white/90 font-mono text-xs md:text-sm font-bold tracking-[0.2em] z-10 select-none drop-shadow">
                {metadata.version}
              </p>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Bottom Left Version Tag and resource links */}
        <div className="absolute bottom-[max(1.5rem,calc(1rem+env(safe-area-inset-bottom,0px)))] left-6 text-xs text-white/40 font-sans z-30 select-text text-left max-w-[280px] md:max-w-md pointer-events-auto flex flex-col gap-1">
          <div className="font-mono text-white/30">{metadata.version}</div>
          <ResourceLinks />
        </div>

        {/* Bottom Right Legal Notice */}
        <div className="absolute bottom-[max(1.5rem,calc(1rem+env(safe-area-inset-bottom,0px)))] right-6 text-[10px] md:text-xs text-white/40 font-sans z-30 select-text text-right max-w-[280px] md:max-w-md pointer-events-auto">
          By using RhythmMania, you acknowledge and agree to the{' '}
          <a href="/tos" className="text-white/60 hover:text-white underline transition-colors">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="/privacypolicy" className="text-white/60 hover:text-white underline transition-colors">
            Privacy Policy
          </a>
          .
        </div>

      </div>
    </div>
  );
};
