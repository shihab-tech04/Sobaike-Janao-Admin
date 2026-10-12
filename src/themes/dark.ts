import { ColorTokens, baseTokens } from './tokens';

/**
 * Sobai Ke Janao - Dark Theme
 * Dedicated dark tokens engineered for enterprise operational endurance
 * Deep slate base, elevated surfaces, readable contrast without glowing glare
 */
export const darkColors: ColorTokens = {
  primary: {
    DEFAULT: '#38bdf8', // Sky-400 (Lighter for dark background legibility)
    hover: '#7dd3fc',   // Sky-300
    active: '#bae6fd',  // Sky-200
    subtle: 'rgba(56, 189, 248, 0.12)',
    foreground: '#082f49', // Deep dark foreground on solid primary
  },
  secondary: {
    DEFAULT: '#f8fafc', // Slate-50
    hover: '#e2e8f0',   // Slate-200
    subtle: 'rgba(248, 250, 252, 0.08)',
    foreground: '#0f172a',
  },
  background: {
    DEFAULT: '#090d16', // Deep charcoal/slate neutral
    subtle: '#0f172a',  // Slate-900
    muted: '#1e293b',   // Slate-800
    overlay: 'rgba(0, 0, 0, 0.75)',
  },
  surface: {
    DEFAULT: '#0f172a', // Slate-900 slightly elevated from background
    raised: '#1e293b',  // Slate-800 elevated cards/modals
    sunken: '#090d16',  // Recessed
    overlay: '#1e293b',
  },
  card: {
    DEFAULT: '#0f172a', // Slate-900
    hover: '#131e33',   // Subtle highlight on hover
    highlight: 'rgba(56, 189, 248, 0.08)',
    border: '#1e293b',  // Slate-800
  },
  border: {
    subtle: '#1e293b',  // Slate-800
    DEFAULT: '#334155', // Slate-700
    strong: '#475569',  // Slate-600
    focus: '#38bdf8',   // Sky-400
  },
  text: {
    primary: '#f8fafc',   // Slate-50
    secondary: '#cbd5e1', // Slate-300
    muted: '#94a3b8',     // Slate-400
    inverse: '#0f172a',
    disabled: '#64748b',  // Slate-500
  },
  disabled: {
    background: '#1e293b',
    text: '#64748b',
    border: '#334155',
  },
  status: {
    success: {
      DEFAULT: '#22c55e', // Green-500
      subtle: 'rgba(34, 197, 94, 0.15)',
      border: 'rgba(34, 197, 94, 0.3)',
      foreground: '#86efac',
    },
    warning: {
      DEFAULT: '#f59e0b', // Amber-500
      subtle: 'rgba(245, 158, 11, 0.15)',
      border: 'rgba(245, 158, 11, 0.3)',
      foreground: '#fde68a',
    },
    error: {
      DEFAULT: '#ef4444', // Red-500
      subtle: 'rgba(239, 68, 68, 0.15)',
      border: 'rgba(239, 68, 68, 0.3)',
      foreground: '#fca5a5',
    },
    info: {
      DEFAULT: '#38bdf8', // Sky-400
      subtle: 'rgba(56, 189, 248, 0.15)',
      border: 'rgba(56, 189, 248, 0.3)',
      foreground: '#7dd3fc',
    },
  },
};

export const darkTheme = {
  mode: 'dark' as const,
  colors: darkColors,
  ...baseTokens,
};
