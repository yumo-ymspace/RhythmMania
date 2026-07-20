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

import { MAX_SKIN_COMPRESSED_SIZE_BYTES, validateZipLimits, validateZipEntrySize } from '../../utils/securityLimits';

export async function loadSkinFile(file: File): Promise<{ colors?: string[], name?: string } | null> {
  if (file.name.endsWith('.ini')) {
    const text = await file.text();
    return processSkinIniAndColors(text, file.name);
  } else if (file.name.endsWith('.osk') || file.name.endsWith('.zip')) {
    if (file.size > MAX_SKIN_COMPRESSED_SIZE_BYTES) {
      alert(`Security Exception: Skin file size exceeds limit (${(file.size / (1024 * 1024)).toFixed(1)} MB, limit: ${(MAX_SKIN_COMPRESSED_SIZE_BYTES / (1024 * 1024)).toFixed(1)} MB)`);
      return null;
    }
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      await zip.loadAsync(file);
      validateZipLimits(zip, true);
      
      let skinIniFile = zip.file('skin.ini');
      if (!skinIniFile) {
        const files = Object.keys(zip.files);
        const nestedIni = files.find(f => f.toLowerCase().endsWith('skin.ini'));
        if (nestedIni) {
          skinIniFile = zip.file(nestedIni);
        }
      }
      if (!skinIniFile) {
        alert('Could not find any "skin.ini" file inside the zip/osk skin file container.');
        return null;
      }
      validateZipEntrySize(skinIniFile, skinIniFile.name);
      const txt = await skinIniFile.async('text');
      return processSkinIniAndColors(txt, file.name);
    } catch (err: any) {
      console.error('Failed unpacking zip/osk:', err);
      alert(err?.message || 'Unsupported ZIP archive schema, or file is corrupted.');
      return null;
    }
  } else {
    alert('Unsupported file type. Please upload a standard "skin.ini" or a compiled ".osk"/".zip" package.');
    return null;
  }
}

export function processSkinIniAndColors(iniText: string, filename: string): { colors: string[], name: string } {
  const lines = iniText.split('\n');
  
  let skinName = filename.replace(/\.(ini|osk|zip)$/i, '');
  const nameLine = lines.find(l => l.trim().toLowerCase().startsWith('name:'));
  if (nameLine) {
    const parsed = nameLine.split(':')[1]?.trim();
    if (parsed) skinName = parsed;
  }

  const customPalette = [
    '#ffffff', // 0: Outer
    '#ffffff', // 1: Main
    '#ffffff', // 2: Center
    '#ffffff', // 3: Special 8K
    '#ffffff'  // 4: Hold
  ];

  let currentKeysCount = 4;
  let inManiaSection = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('//')) continue;
    
    if (t.startsWith('[')) {
      if (t.toLowerCase() === '[mania]') {
        inManiaSection = true;
      }
      continue;
    }
    
    if (inManiaSection) {
      if (t.toLowerCase().startsWith('keys:')) {
        const val = parseInt(t.split(':')[1]?.trim() || '4', 10);
        if (!isNaN(val)) currentKeysCount = val;
      }
      
      const colorMatch = t.match(/^(?:Colour|Color|KeyColour|KeyColor|NoteImageColor)(\d+)\s*:\s*([\d, ]+)/i);
      if (colorMatch && currentKeysCount === 4) {
        const idx = parseInt(colorMatch[1], 10) - 1; 
        const rgbStr = colorMatch[2];
        const rgbParts = rgbStr.split(',').map(s => parseInt(s.trim(), 10));
        
        if (rgbParts.length >= 3) {
          const hex = '#' + rgbParts.slice(0,3).map(x => {
            const h = x.toString(16);
            return h.length === 1 ? '0' + h : h;
          }).join('');
          
          if (idx === 0 || idx === 3) {
            customPalette[0] = hex; 
          } else if (idx === 1 || idx === 2) {
            customPalette[1] = hex; 
          }
        }
      }
    }
  }

  customPalette[2] = customPalette[1];
  
  const accentH = customPalette[0] !== '#ffffff' ? customPalette[0] : '#00b0ff';
  customPalette[4] = accentH;

  return { colors: customPalette, name: skinName };
}
