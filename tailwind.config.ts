import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './content/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#08090c',
          900: '#0d0f14',
          800: '#151821',
          700: '#1f2430',
          600: '#2c3342',
          500: '#414a5c',
          400: '#6b7689',
          300: '#98a1b2',
          200: '#c6ccd8',
          100: '#e6e9ef',
        },
        // Brand accent. Used for interface chrome and text, never as a data mark.
        signal: {
          DEFAULT: '#3ddc97',
          dim: '#2bb97c',
          glow: 'rgba(61, 220, 151, 0.18)',
        },
        // Status palette for data marks. Validated with the palette checker:
        // OKLCH lightness band, chroma floor, CVD separation, normal-vision
        // floor and surface contrast all pass in both modes. Never reused as
        // categorical series colours, and always paired with an icon and label.
        status: {
          good: '#1fa56f',
          warn: '#b8850a',
          bad: '#d43a4c',
          'good-light': '#0f8a5a',
          'warn-light': '#a8730a',
          'bad-light': '#c22f43',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Inter', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
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
