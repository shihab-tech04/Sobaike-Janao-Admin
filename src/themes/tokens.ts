/**
 * Sobai Ke Janao - Design Tokens Foundation
 * Aligned with Sobai Ke Janao public civic identity and enterprise admin standards
 */

export interface ColorTokens {
  primary: {
    DEFAULT: string;
    hover: string;
    active: string;
    subtle: string;
    foreground: string;
  };
  secondary: {
    DEFAULT: string;
    hover: string;
    subtle: string;
    foreground: string;
  };
  background: {
    DEFAULT: string;
    subtle: string;
    muted: string;
    overlay: string;
  };
  surface: {
    DEFAULT: string;
    raised: string;
    sunken: string;
    overlay: string;
  };
  card: {
    DEFAULT: string;
    hover: string;
    highlight: string;
    border: string;
  };
  border: {
    subtle: string;
    DEFAULT: string;
    strong: string;
    focus: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    inverse: string;
    disabled: string;
  };
  disabled: {
    background: string;
    text: string;
    border: string;
  };
  status: {
    success: {
      DEFAULT: string;
      subtle: string;
      border: string;
      foreground: string;
    };
    warning: {
      DEFAULT: string;
      subtle: string;
      border: string;
      foreground: string;
    };
    error: {
      DEFAULT: string;
      subtle: string;
      border: string;
      foreground: string;
    };
    info: {
      DEFAULT: string;
      subtle: string;
      border: string;
      foreground: string;
    };
  };
}

export interface SpacingTokens {
  4: string;   // 4px - 0.25rem
  8: string;   // 8px - 0.5rem
  12: string;  // 12px - 0.75rem
  16: string;  // 16px - 1rem
  20: string;  // 20px - 1.25rem
  24: string;  // 24px - 1.5rem
  32: string;  // 32px - 2rem
  40: string;  // 40px - 2.5rem
  48: string;  // 48px - 3rem
}

export interface TypographyTokens {
  fontFamily: {
    sans: string;
    bengali: string;
    mono: string;
  };
  scale: {
    display: {
      fontSize: string;
      lineHeight: string;
      fontWeight: string;
      letterSpacing: string;
    };
    pageTitle: {
      fontSize: string;
      lineHeight: string;
      fontWeight: string;
      letterSpacing: string;
    };
    sectionTitle: {
      fontSize: string;
      lineHeight: string;
      fontWeight: string;
      letterSpacing: string;
    };
    cardTitle: {
      fontSize: string;
      lineHeight: string;
      fontWeight: string;
      letterSpacing: string;
    };
    body: {
      fontSize: string;
      lineHeight: string;
      fontWeight: string;
    };
    bodyMedium: {
      fontSize: string;
      lineHeight: string;
      fontWeight: string;
    };
    caption: {
      fontSize: string;
      lineHeight: string;
      fontWeight: string;
    };
    small: {
      fontSize: string;
      lineHeight: string;
      fontWeight: string;
    };
    tableText: {
      fontSize: string;
      lineHeight: string;
      fontWeight: string;
    };
    button: {
      fontSize: string;
      lineHeight: string;
      fontWeight: string;
      letterSpacing: string;
    };
    badge: {
      fontSize: string;
      lineHeight: string;
      fontWeight: string;
      letterSpacing: string;
    };
  };
}

export interface RadiusTokens {
  none: string;
  small: string;  // 4px
  medium: string; // 8px
  large: string;  // 12px
  full: string;   // 9999px
}

export interface ShadowTokens {
  none: string;
  small: string;
  medium: string;
  large: string;
}

export interface ThemeTokens {
  spacing: SpacingTokens;
  typography: TypographyTokens;
  radius: RadiusTokens;
  shadows: ShadowTokens;
}

export const baseTokens: ThemeTokens = {
  spacing: {
    4: '0.25rem',  // 4px
    8: '0.5rem',   // 8px
    12: '0.75rem', // 12px
    16: '1rem',    // 16px
    20: '1.25rem', // 20px
    24: '1.5rem',  // 24px
    32: '2rem',    // 32px
    40: '2.5rem',  // 40px
    48: '3rem',    // 48px
  },
  typography: {
    fontFamily: {
      sans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      bengali: '"Hind Siliguri", "Noto Sans Bengali", "Kalpurush", system-ui, -apple-system, sans-serif',
      mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    },
    scale: {
      display: {
        fontSize: '1.875rem', // 30px
        lineHeight: '2.25rem', // 36px
        fontWeight: '700',
        letterSpacing: '-0.025em',
      },
      pageTitle: {
        fontSize: '1.5rem', // 24px
        lineHeight: '2rem', // 32px
        fontWeight: '700',
        letterSpacing: '-0.02em',
      },
      sectionTitle: {
        fontSize: '1.125rem', // 18px
        lineHeight: '1.75rem', // 28px
        fontWeight: '600',
        letterSpacing: '-0.01em',
      },
      cardTitle: {
        fontSize: '1rem', // 16px
        lineHeight: '1.5rem', // 24px
        fontWeight: '600',
        letterSpacing: '-0.01em',
      },
      body: {
        fontSize: '0.875rem', // 14px
        lineHeight: '1.375rem', // 22px
        fontWeight: '400',
      },
      bodyMedium: {
        fontSize: '0.875rem', // 14px
        lineHeight: '1.375rem', // 22px
        fontWeight: '500',
      },
      caption: {
        fontSize: '0.75rem', // 12px
        lineHeight: '1rem', // 16px
        fontWeight: '400',
      },
      small: {
        fontSize: '0.75rem', // 12px
        lineHeight: '1rem', // 16px
        fontWeight: '500',
      },
      tableText: {
        fontSize: '0.8125rem', // 13px
        lineHeight: '1.25rem', // 20px
        fontWeight: '400',
      },
      button: {
        fontSize: '0.875rem', // 14px
        lineHeight: '1.25rem', // 20px
        fontWeight: '500',
        letterSpacing: '0.01em',
      },
      badge: {
        fontSize: '0.6875rem', // 11px
        lineHeight: '0.875rem', // 14px
        fontWeight: '600',
        letterSpacing: '0.03em',
      },
    },
  },
  radius: {
    none: '0',
    small: '0.25rem',  // 4px
    medium: '0.5rem',  // 8px
    large: '0.75rem',  // 12px
    full: '9999px',
  },
  shadows: {
    none: 'none',
    small: '0 1px 2px 0 rgba(15, 23, 42, 0.05)',
    medium: '0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.04)',
    large: '0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04)',
  },
};
