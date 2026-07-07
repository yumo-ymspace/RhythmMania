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

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { GameSettings } from '../../types';
import SettingsSidebar from './SettingsSidebar';
import SettingsSearchBar from './SettingsSearchBar';
import SettingsPane from './SettingsPane';
import OffsetWizardModal from './OffsetWizardModal';
import ConfirmModal from './controls/ConfirmModal';
import { SectionId } from './settingsRegistry';
import { isAtDefault, DEFAULT_SETTINGS } from './defaultSettings';
import { loadSkinFile } from './skinParser';

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  settings: GameSettings;
  updateSettings: (patch: Partial<GameSettings>) => void;
}

export default function SettingsDrawer({ open, onClose, settings, updateSettings }: SettingsDrawerProps) {
  const [activeSection, setActiveSection] = useState<SectionId>('general');
  const [query, setQuery] = useState('');
  const [shaking, setShaking] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (shaking) {
      const t = setTimeout(() => setShaking(false), 250);
      return () => clearTimeout(t);
    }
  }, [shaking]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const resetRow = (id: string) => {
    // If it's a complex object like bindings, we need to deep copy from DEFAULT_SETTINGS
    const dv = (DEFAULT_SETTINGS as any)[id];
    let val = dv;
    if (dv && typeof dv === 'object') {
      val = JSON.parse(JSON.stringify(dv));
    }
    updateSettings({ [id]: val });
  };

  const handleRestoreRequest = () => {
    setConfirmOpen(true);
  };

  const restoreAll = () => {
    updateSettings({
      ...DEFAULT_SETTINGS,
      customSkinName: undefined,
      videoOffset: 0,
      disableVideo: false,
      disableParticles: false,
      limitDprToOne: false,
    });
  };

  const handleFileUpload = async (file: File) => {
    const res = await loadSkinFile(file);
    if (res && res.colors) {
      updateSettings({
        skinId: 'custom',
        customSkinColors: res.colors
      });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div 
              key="backdrop"
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              onClick={onClose} 
              aria-hidden 
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <motion.aside 
              key="drawer"
              className="settings-shell fixed inset-y-0 left-0 z-50 w-full md:w-[860px] md:max-w-[90vw] flex flex-col md:flex-row"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              initial={{ x: '-100%', opacity: 0.6 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '-100%', opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <SettingsSidebar 
                activeSection={activeSection} 
                onSelect={setActiveSection}
                onRestoreAll={handleRestoreRequest} 
              />
              <div className="flex-1 flex flex-col min-w-0">
                <SettingsSearchBar 
                  value={query} 
                  onChange={setQuery} 
                  onClose={onClose}
                  shaking={shaking} 
                />
                <SettingsPane 
                  activeSection={activeSection} 
                  query={query}
                  settings={settings} 
                  update={updateSettings}
                  resetRow={resetRow}
                  onNoResults={() => setShaking(true)}
                  openWizard={() => setWizardOpen(true)} 
                  openSkin={() => fileInputRef.current?.click()}
                  restoreAll={handleRestoreRequest}
                  isAtDefault={isAtDefault}
                />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <ConfirmModal 
        isOpen={confirmOpen}
        message="Reset every setting to its default value?"
        onConfirm={restoreAll}
        onCancel={() => setConfirmOpen(false)}
      />

      {wizardOpen && (
        <OffsetWizardModal
          initial={settings.audioOffset}
          onApply={(v) => { updateSettings({ audioOffset: v }); setWizardOpen(false); }}
          onClose={() => setWizardOpen(false)}
        />
      )}
      
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept=".ini,.osk,.zip"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file);
          e.target.value = '';
        }}
      />
    </>
  );
}
