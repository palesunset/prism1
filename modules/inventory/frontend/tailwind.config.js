/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', 'html:not(.light)'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        slate: {
          50: 'var(--tw-slate-50)',
          100: 'var(--tw-slate-100)',
          200: 'var(--tw-slate-200)',
          300: 'var(--tw-slate-300)',
          400: 'var(--tw-slate-400)',
          500: 'var(--tw-slate-500)',
          600: 'var(--tw-slate-600)',
          700: 'var(--tw-slate-700)',
          800: 'var(--tw-slate-800)',
          900: 'var(--tw-slate-900)',
          950: 'var(--tw-slate-950)',
        },
        sky: {
          100: 'var(--tw-sky-100)',
          400: 'var(--tw-sky-400)',
          500: 'var(--tw-sky-500)',
          600: 'var(--tw-sky-600)',
          700: 'var(--tw-sky-700)',
          900: 'var(--tw-sky-900)',
        },
        emerald: {
          50: 'var(--tw-emerald-50)',
          400: 'var(--tw-emerald-400)',
          500: 'var(--tw-emerald-500)',
          700: 'var(--tw-emerald-700)',
          900: 'var(--tw-emerald-900)',
          950: 'var(--tw-emerald-950)',
        },
        orange: {
          50: 'var(--tw-orange-50)',
          400: 'var(--tw-orange-400)',
          500: 'var(--tw-orange-500)',
          900: 'var(--tw-orange-900)',
          950: 'var(--tw-orange-950)',
        },
        red: {
          50: 'var(--tw-red-50)',
          400: 'var(--tw-red-400)',
          500: 'var(--tw-red-500)',
          600: 'var(--tw-red-600)',
          700: 'var(--tw-red-700)',
          800: 'var(--tw-red-800)',
          950: 'var(--tw-red-950)',
        },
        indigo: {
          50: 'var(--tw-indigo-50)',
          200: 'var(--tw-indigo-200)',
          300: 'var(--tw-indigo-300)',
          600: 'var(--tw-indigo-600)',
          900: 'var(--tw-indigo-900)',
          950: 'var(--tw-indigo-950)',
        },
        amber: {
          400: 'var(--tw-amber-400)',
          600: 'var(--tw-amber-600)',
        },
        white: 'var(--tw-white)',
        black: 'var(--tw-black)',
      },
      fontFamily: {
        mono: ['Fira Code', 'ui-monospace', 'monospace'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        odys: '4px',
        'odys-lg': '8px',
        'odys-xl': '10px',
      },
    },
  },
  plugins: [],
};
