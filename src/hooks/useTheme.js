// src/hooks/useTheme.js — 테마 계산 로직 커스텀 훅
import { useCallback } from 'react';
import { DEFAULT_ACCENT_COLOR } from '../constants';
const { ipcRenderer } = window.require('electron');

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function hexToHSL(hex) {
  const rgb = hexToRgb(hex);
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return {
    h: h * 360,
    s: s * 100,
    l: l * 100
  };
}

export default function useTheme() {
  const themeCalc = useCallback((accentColor, defaultColor = DEFAULT_ACCENT_COLOR) => {
    try {
      const root = document.documentElement;

      root.style.setProperty('--primary-color', accentColor);

      const rgb = hexToRgb(accentColor);
      const hsl = hexToHSL(accentColor);
      const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
      const combinedBrightness = (luminance + (hsl.l / 100)) / 2;

      const shadowUpVars = {
        h: hsl.h - 3,
        s: Math.max(0, hsl.s - 30),
        l: Math.max(0, hsl.l - 4)
      };

      const shadowDownVars = {
        h: hsl.h,
        s: Math.max(0, hsl.s - 20),
        l: Math.min(100, hsl.l + 10)
      };

      const immediateVars = {
        '--primary-text': combinedBrightness > 0.6 ? '#333' : '#f5f5f5',
        '--primary-filter': combinedBrightness > 0.6
          ? 'invert(19%) sepia(0%) saturate(2%) hue-rotate(82deg) brightness(96%) contrast(96%)'
          : 'invert(99%) sepia(15%) saturate(70%) hue-rotate(265deg) brightness(113%) contrast(92%)',
        '--primary-color-shadow-up': `hsla(${shadowUpVars.h}, ${shadowUpVars.s}%, ${shadowUpVars.l}%, 1)`,
        '--primary-color-shadow-down': `hsla(${shadowDownVars.h}, ${shadowDownVars.s}%, ${shadowDownVars.l}%, 1)`,
        '--logo-filter': `hue-rotate(${hsl.h - hexToHSL(defaultColor).h}deg) saturate(${(hsl.s / hexToHSL(defaultColor).s) * 100}%) brightness(${(hsl.l / hexToHSL(defaultColor).l) * 100}%)`
      };

      Object.entries(immediateVars).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });

      ipcRenderer.invoke('generate-css-filter', accentColor, {
        acceptanceLossPercentage: 1,
        maxChecks: 10
      }).then(colorFilter => {
        if (colorFilter && colorFilter.filter) {
          const filterValue = colorFilter.filter.replace(/;$/, '').trim();
          root.style.setProperty('--primary-color-filter', filterValue);

          ipcRenderer.send('update-theme-variables', {
            '--primary-color': accentColor,
            '--primary-color-filter': filterValue,
            ...immediateVars
          });
        }
      }).catch(error => {
        console.error('[useTheme] CSS 필터 생성 실패:', error);
      });
    } catch (error) {
      console.error('[useTheme] CSS 변수 업데이트 실패:', error);
    }
  }, []);

  return { themeCalc, hexToRgb, hexToHSL };
}

export { hexToRgb, hexToHSL };
