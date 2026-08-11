export interface ColumnStyle {
  width: number;
  color: string;
}

export function getColumnStyles(
  keyCount: number,
  baseWidth: number,
  skinId?: string,
  customSkinColors?: string[],
  laneColors?: string[] | null,
): ColumnStyle[] {
  let colors = {
    blue: '#2e6b9e',
    white: '#eceff1',
    accent: '#d32f2f',
    cyan: '#00b0ff',
  };

  if (skinId === 'custom' && customSkinColors && customSkinColors.length >= 4) {
    colors = {
      blue: customSkinColors[0] || '#2e6b9e',
      white: customSkinColors[1] || '#eceff1',
      accent: customSkinColors[2] || '#d32f2f',
      cyan: customSkinColors[3] || '#00b0ff',
    };
  } else if (skinId === 'classic-bar') {
    colors = { blue: '#00e5ff', white: '#ffc107', accent: '#f50057', cyan: '#00e676' };
  } else if (skinId === 'circles') {
    colors = { blue: '#2979ff', white: '#ff4081', accent: '#ffeb3b', cyan: '#00e5ff' };
  } else if (skinId === 'cyberpunk') {
    colors = { blue: '#ec4899', white: '#8b5cf6', accent: '#eab308', cyan: '#06b6d4' };
  } else if (skinId === 'emerald') {
    colors = { blue: '#10b981', white: '#34d399', accent: '#34d399', cyan: '#059669' };
  } else if (skinId === 'minimalist') {
    colors = { blue: '#475569', white: '#f8fafc', accent: '#cbd5e1', cyan: '#64748b' };
  } else if (skinId === 'glassy-spheres') {
    colors = { blue: '#0284c7', white: '#ec4899', accent: '#eab308', cyan: '#06b6d4' };
  } else if (skinId === 'hollow-rings') {
    colors = { blue: '#3b82f6', white: '#c084fc', accent: '#f43f5e', cyan: '#14b8a6' };
  }

  return Array.from({ length: keyCount }, (_, i) => {
    let color = colors.white;
    if (keyCount === 5) {
      color = i === 2 ? colors.accent : i === 0 || i === 4 ? colors.blue : colors.white;
    } else if (keyCount === 7) {
      color = i === 3 ? colors.accent : i % 2 === 0 ? colors.blue : colors.white;
    } else if (keyCount === 8) {
      color = i === 0 ? colors.cyan : i % 2 === 1 ? colors.blue : colors.white;
    } else if (keyCount === 6) {
      color = i === 0 || i === 2 || i === 3 || i === 5 ? colors.blue : colors.white;
    } else {
      color = i === 0 || i === keyCount - 1 ? colors.blue : colors.white;
    }
    return { width: baseWidth, color: laneColors?.[i] || color };
  });
}
