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
import { X, Check, AlertCircle, Loader2 } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignIn: () => Promise<void> | void;
  authLoading?: boolean;
  authError?: string | null;
}

export default function LoginModal({
  isOpen,
  onClose,
  onSignIn,
  authLoading = false,
  authError = null,
}: LoginModalProps) {
  const [agreedToTos, setAgreedToTos] = useState(false);
  const [agreedToPp, setAgreedToPp] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  const canSignIn = agreedToTos && agreedToPp;

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  const handleButtonClick = () => {
    if (!canSignIn) {
      setIsShaking(true);
      setShakeKey((prev) => prev + 1);
      return;
    }

    if (!authLoading) {
      onSignIn();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="login-modal-title"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/75 backdrop-blur-md"
            aria-hidden="true"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-cyan-400/25 bg-[#071932]/95 p-6 shadow-[0_25px_60px_rgba(0,0,0,0.7),0_0_30px_rgba(0,176,255,0.15)] backdrop-blur-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="login-modal-title" className="text-xl font-black tracking-tight text-white">
                  Log in to RhythmMania
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Connect your account to save online stats, cloud scores, and access leaderboards.
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              {/* Dynamic Warning Message: Shown when either box is not ticked */}
              <AnimatePresence mode="wait">
                {!canSignIn && (
                  <motion.div
                    key="agreement-warning"
                    initial={{ opacity: 0, height: 0, y: -6 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
                    <span className="font-medium">
                      Please agree to the Terms of Service and the Privacy Policy
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Log in with Google Button */}
              <div>
                <motion.button
                  key={shakeKey}
                  type="button"
                  onClick={handleButtonClick}
                  onAnimationComplete={() => setIsShaking(false)}
                  animate={isShaking ? { x: [-10, 10, -8, 8, -4, 4, 0] } : { x: 0 }}
                  transition={{ duration: 0.4, ease: 'easeInOut' }}
                  className={`group relative flex w-full items-center justify-center gap-3 rounded-xl py-3 px-4 text-sm font-bold transition-all select-none ${
                    canSignIn
                      ? 'border border-white/20 bg-white text-slate-900 shadow-[0_0_25px_rgba(255,255,255,0.25)] hover:bg-slate-100 hover:shadow-[0_0_30px_rgba(255,255,255,0.35)] active:scale-[0.98] cursor-pointer'
                      : 'border border-slate-700/60 bg-slate-800/80 text-slate-400 opacity-60 hover:bg-slate-800/90 active:scale-[0.99] cursor-pointer'
                  }`}
                  aria-disabled={!canSignIn}
                >
                  {authLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin text-slate-900" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                        <path
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          fill="#4285F4"
                        />
                        <path
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          fill="#34A853"
                        />
                        <path
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                          fill="#FBBC05"
                        />
                        <path
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                          fill="#EA4335"
                        />
                      </svg>
                      <span>Log in with Google</span>
                    </>
                  )}
                </motion.button>
              </div>

              {/* Checkboxes: Below the Google button */}
              <div className="space-y-3 pt-1">
                {/* 1. Terms of Service Checkbox */}
                <label className="flex items-start gap-3 cursor-pointer select-none group">
                  <div
                    role="checkbox"
                    aria-checked={agreedToTos}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        setAgreedToTos((prev) => !prev);
                      }
                    }}
                    onClick={() => setAgreedToTos((prev) => !prev)}
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 ${
                      agreedToTos
                        ? 'border-cyan-400 bg-cyan-500 text-slate-950'
                        : 'border-slate-600 bg-slate-800/80 group-hover:border-slate-400'
                    }`}
                  >
                    {agreedToTos && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                  <span className="text-xs text-slate-300 leading-tight">
                    I acknowledge and agree to the{' '}
                    <a
                      href="https://terms-of-service.rhythm-mania.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-cyan-400 hover:text-cyan-300 underline font-medium transition-colors"
                    >
                      Terms of Service
                    </a>
                  </span>
                </label>

                {/* 2. Privacy Policy Checkbox */}
                <label className="flex items-start gap-3 cursor-pointer select-none group">
                  <div
                    role="checkbox"
                    aria-checked={agreedToPp}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        setAgreedToPp((prev) => !prev);
                      }
                    }}
                    onClick={() => setAgreedToPp((prev) => !prev)}
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 ${
                      agreedToPp
                        ? 'border-cyan-400 bg-cyan-500 text-slate-950'
                        : 'border-slate-600 bg-slate-800/80 group-hover:border-slate-400'
                    }`}
                  >
                    {agreedToPp && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                  <span className="text-xs text-slate-300 leading-tight">
                    I acknowledge and agree to the{' '}
                    <a
                      href="https://privacy-policy.rhythm-mania.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-cyan-400 hover:text-cyan-300 underline font-medium transition-colors"
                    >
                      Privacy Policy
                    </a>
                  </span>
                </label>
              </div>

              {/* Auth error feedback if any */}
              {authError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                  {authError}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
