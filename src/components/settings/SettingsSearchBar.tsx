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

import React, { useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

interface SettingsSearchBarProps {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  shaking: boolean;
}

export default function SettingsSearchBar({ value, onChange, onClose, shaking }: SettingsSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + F to focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      
      // Esc clears search or closes drawer
      if (e.key === 'Escape') {
        if (value) {
          onChange('');
          e.stopPropagation();
        } else {
          onClose();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [value, onChange, onClose]);

  return (
    <div className="flex-none p-4 border-b border-[var(--settings-border)]/5 flex items-center justify-between">
      <div className={`relative flex-1 max-w-sm ${shaking ? 'settings-shake' : ''}`}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search settings... (Ctrl+F)"
          className="w-full bg-black/20 border border-slate-700/50 rounded-lg pl-9 pr-8 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[var(--skin-accent)] focus:ring-1 focus:ring-[var(--skin-accent)] transition-all"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      
      <button 
        onClick={onClose}
        className="ml-4 p-2 text-slate-400 hover:text-slate-100 bg-slate-800/50 hover:bg-slate-700/50 rounded-full transition-colors flex-none"
        title="Close (Esc)"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
