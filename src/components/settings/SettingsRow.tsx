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

import React, { ReactNode } from 'react';

interface SettingsRowProps {
  id: string;
  label: string;
  description: string;
  isChanged: boolean;
  onReset: () => void;
  children: ReactNode;
  key?: string;
}

export default function SettingsRow({ id, label, description, isChanged, onReset, children }: SettingsRowProps) {
  return (
    <div className="settings-row group">
      <div
        className={`settings-rail ${isChanged ? 'is-changed' : ''}`}
        onClick={isChanged ? onReset : undefined}
        title={isChanged ? "Reset to default" : undefined}
        role={isChanged ? "button" : undefined}
        tabIndex={isChanged ? 0 : undefined}
        onKeyDown={(e) => {
          if (isChanged && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onReset();
          }
        }}
      />
      <label htmlFor={`setting-${id}`} className="flex flex-col justify-center cursor-pointer min-w-0">
        <span className="text-sm font-medium text-slate-100 select-none">
          {label}
        </span>
        <div className="text-xs text-slate-400 mt-0.5 max-w-prose leading-snug">
          {description}
        </div>
      </label>
      <div className="flex items-center justify-end">
        {children}
      </div>
    </div>
  );
}
