import { ColorTokens, baseTokens } from './tokens';

/**
 * Sobai Ke Janao - Light Theme
 * Professional civic/government enterprise UI
 * Soft neutral background, crisp white card surfaces, subtle borders, high contrast
 */
export const lightColors: ColorTokens = {
  primary: {
    DEFAULT: '#0284c7', // Sky-600 (Sobai Ke Janao civic blue)
    hover: '#0369a1',   // Sky-700
    active: '#075985',  // Sky-800
    subtle: '#f0f9ff',  // Sky-50
    foreground: '#ffffff',
  },
  secondary: {
    DEFAULT: '#0f172a', // Slate-900
    hover: '#1e293b',   // Slate-800
    subtle: '#f1f5f9',  // Slate-100
    foreground: '#ffffff',
  },
  background: {
    DEFAULT: '#f8fafc', // Slate-50 soft neutral (not pure stark white)
    subtle: '#f1f5f9',  // Slate-100
    muted: '#e2e8f0',   // Slate-200
    overlay: 'rgba(15, 23, 42, 0.45)',
  },
  surface: {
    DEFAULT: '#ffffff', // Crisp white surface
    raised: '#ffffff',
    sunken: '#f8fafc',
    overlay: '#ffffff',
  },
  card: {
    DEFAULT: '#ffffff',
    hover: '#fafafa',
    highlight: '#f0fdf4', // Subtle success-tinted highlight
    border: '#e2e8f0',
  },
  border: {
    subtle: '#f1f5f9',  // Slate-100
    DEFAULT: '#e2e8f0', // Slate-200
    strong: '#cbd5e1',  // Slate-300
    focus: '#0284c7',   // Sky-600
  },
  text: {
    primary: '#0f172a',   // Slate-900 high contrast
    secondary: '#475569', // Slate-600
    muted: '#64748b',     // Slate-500
    inverse: '#ffffff',
    disabled: '#94a3b8',  // Slate-400
  },
  disabled: {
    background: '#f1f5f9',
    text: '#94a3b8',
    border: '#e2e8f0',
  },
  status: {
    success: {
      DEFAULT: '#16a34a', // Green-600
      subtle: '#f0fdf4',  // Green-50
      border: '#bbf7d0',  // Green-200
      foreground: '#166534',
    },
    warning: {
      DEFAULT: '#d97706', // Amber-600
      subtle: '#fffbeb',  // Amber-50
      border: '#fde68a',  // Amber-200
      foreground: '#92400e',
    },
    error: {
      DEFAULT: '#dc2626', // Red-600
      subtle: '#fef2f2',  // Red-50
      border: '#fecaca',  // Red-200
      foreground: '#991b1b',
    },
    info: {
      DEFAULT: '#0284c7', // Sky-600
      subtle: '#f0f9ff',  // Sky-50
      border: '#bae6fd',  // Sky-200
      foreground: '#075985',
    },
  },
};

export const lightTheme = {
  mode: 'light' as const,
  colors: lightColors,
  ...baseTokens,
};

export type Theme = typeof lightTheme;
