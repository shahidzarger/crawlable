import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './content/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      /*
       * Brand palette, taken from the Crawlable brand assets (Product Hunt
       * gallery and thumbnail SVGs). Components style through the CSS
       * variables in globals.css, not these classes; they are here so a
       * one-off utility (bg-brand, text-slate-600) matches the brand exactly.
       */
      colors: {
        brand: {
          DEFAULT: '#15803D', // emerald accent, square mark, keys in code
          bright: '#4ADE80', // terminal prompt, accent on dark
          soft: '#F0FDF4', // badge fill
        },
        slate: {
          950: '#020617',
          900: '#0F172A', // headings, terminal body, outlines
          800: '#1E293B', // terminal highlight row
          700: '#334155', // code text
          600: '#475569', // body copy
          500: '#64748B', // muted labels
          400: '#94A3B8', // dim (decorative only — fails AA as text)
          300: '#CBD5E1', // strong borders, window dots
          200: '#E2E8F0', // borders, hard offset shadow
          100: '#F1F5F9', // grid lines
          50: '#F8FAFC', // sunken surfaces, window chrome
        },
        status: {
          good: '#15803D',
          warn: '#B45309',
          bad: '#DC2626',
          highlight: '#FBBF24',
        },
      },
      fontFamily: {
        // --font-sans / --font-mono are set by next/font in app/fonts.ts.
        sans: ['var(--font-sans)', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'SFMono-Regular', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        sweep: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(220%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
        sweep: 'sweep 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
