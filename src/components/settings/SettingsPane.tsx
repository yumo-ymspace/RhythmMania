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

import React, { useEffect } from 'react';
import type { GameSettings } from '../../types';
import type { SectionId } from './settingsRegistry';
import { SECTIONS, ROWS } from './settingsRegistry';
import SettingsRow from './SettingsRow';
import SettingsToggle from './controls/SettingsToggle';
import SettingsSlider from './controls/SettingsSlider';
import SettingsSelect from './controls/SettingsSelect';
import SettingsButton from './controls/SettingsButton';
import ColorSwatchRow from './controls/ColorSwatchRow';

interface SettingsPaneProps {
  activeSection: SectionId;
  query: string;
  settings: GameSettings;
  update: (patch: Partial<GameSettings>) => void;
  resetRow: (id: string) => void;
  onNoResults: () => void;
  openWizard: () => void;
  openSkin: () => void;
  restoreAll: () => void;
  isAtDefault: (id: string, value: unknown) => boolean;
}

export default function SettingsPane({
  activeSection,
  query,
  settings,
  update,
  resetRow,
  onNoResults,
  openWizard,
  openSkin,
  restoreAll,
  isAtDefault,
}: SettingsPaneProps) {
  const q = query.trim().toLowerCase();

  const rows = ROWS.filter(r => {
    if (q) return true; // If searching, ignore section filter initially
    return r.section === activeSection;
  }).filter(r => {
    if (r.showWhen && !r.showWhen(settings)) return false;
    if (!q) return true;
    const combined = [r.label, r.description, ...(r.keywords || [])].join(' ').toLowerCase();
    return combined.includes(q);
  });

  useEffect(() => {
    if (q && rows.length === 0) {
      onNoResults();
    }
  }, [q, rows.length, onNoResults]);

  const sectionDef = SECTIONS.find(s => s.id === activeSection);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-8">
      {!q && sectionDef && (
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-slate-100">{sectionDef.label}</h2>
          <p className="text-sm text-slate-400 mt-1">{sectionDef.description}</p>
        </div>
      )}

      {q && rows.length === 0 ? (
        <div className="text-slate-400 mt-8">
          No settings match &ldquo;{query}&rdquo;.
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {rows.map((row) => {
            // Need to pass the isChanged value
            const currentValue = settings[row.id as keyof GameSettings];
            const isChanged = !isAtDefault(row.id, currentValue);

            let controlNode = null;
            if (row.control.kind === 'toggle') {
              controlNode = (
                <SettingsToggle
                  id={`setting-${row.id}`}
                  checked={Boolean(currentValue)}
                  onChange={(v) => update({ [row.id]: v })}
                />
              );
            } else if (row.control.kind === 'slider') {
              controlNode = (
                <SettingsSlider
                  id={`setting-${row.id}`}
                  value={Number(currentValue)}
                  min={row.control.min}
                  max={row.control.max}
                  step={row.control.step}
                  format={row.control.format}
                  suffix={row.control.suffix}
                  onChange={(v) => update({ [row.id]: v })}
                />
              );
            } else if (row.control.kind === 'select') {
              controlNode = (
                <SettingsSelect
                  id={`setting-${row.id}`}
                  value={String(currentValue)}
                  options={row.control.options}
                  onChange={(v) => update({ [row.id]: v })}
                />
              );
            } else if (row.control.kind === 'color-grid') {
              controlNode = (
                <ColorSwatchRow
                  keys={row.control.keys}
                  value={Array.isArray(currentValue) ? currentValue : []}
                  onChange={(next) => update({ [row.id]: next })}
                />
              );
            } else if (row.control.kind === 'button') {
              const action = row.control.action;
              controlNode = (
                <SettingsButton
                  id={`setting-${row.id}`}
                  label={row.control.label}
                  danger={action === 'restoreAll'}
                  onClick={() => {
                    if (action === 'openWizard') openWizard();
                    if (action === 'restoreAll') restoreAll();
                    if (action === 'openSkin') openSkin();
                  }}
                />
              );
            } else if (row.control.kind === 'custom') {
              controlNode = row.control.render({
                settings,
                update,
                resetRow,
                isChanged,
                openWizard,
              });
              
              if (row.id === 'skinPreview' || row.id === 'bindings') {
                return <div key={row.id} className="w-full">{controlNode}</div>;
              }
            }

            return (
              <SettingsRow
                key={row.id}
                id={row.id}
                label={row.label}
                description={row.description}
                isChanged={isChanged}
                onReset={() => resetRow(row.id)}
              >
                {controlNode}
              </SettingsRow>
            );
          })}
        </div>
      )}
    </div>
  );
}
