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
import { Minus, Plus } from 'lucide-react';

interface SettingsSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  suffix?: string;
  id?: string;
}

export default function SettingsSlider({ value, min, max, step, onChange, format, suffix, id }: SettingsSliderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDecrement = () => {
    const newVal = Math.max(min, value - step);
    // Handle floating point precision issues
    onChange(Number(newVal.toFixed(10)));
  };

  const handleIncrement = () => {
    const newVal = Math.min(max, value + step);
    onChange(Number(newVal.toFixed(10)));
  };

  const handleInputSubmit = () => {
    let parsed = parseFloat(inputValue);
    if (!isNaN(parsed)) {
      parsed = Math.max(min, Math.min(max, parsed));
      onChange(parsed);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleInputSubmit();
    if (e.key === 'Escape') {
      setInputValue(value.toString());
      setIsEditing(false);
    }
  };

  const displayValue = format ? format(value) : `${value}${suffix ?? ''}`;
  
  return (
    <div className="flex items-center gap-2">
      <button 
        type="button"
        onClick={handleDecrement}
        className="w-8 h-8 flex items-center justify-center rounded-md bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--skin-accent)] active:scale-95 transition-all"
        aria-label="Decrease value"
      >
        <Minus className="w-4 h-4" />
      </button>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 md:w-36 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--skin-accent)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-[var(--skin-accent)] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md"
        style={{ accentColor: 'var(--skin-accent)' }}
      />
      <button 
        type="button"
        onClick={handleIncrement}
        className="w-8 h-8 flex items-center justify-center rounded-md bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--skin-accent)] active:scale-95 transition-all"
        aria-label="Increase value"
      >
        <Plus className="w-4 h-4" />
      </button>
      
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleInputSubmit}
          onKeyDown={handleKeyDown}
          className="w-14 text-right text-sm font-mono bg-slate-800 text-white rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-[var(--skin-accent)]"
        />
      ) : (
        <span 
          className="w-14 text-right text-sm font-mono text-slate-300 cursor-text hover:text-white select-none"
          onClick={() => setIsEditing(true)}
          title="Click to edit"
        >
          {displayValue}
        </span>
      )}
    </div>
  );
}
