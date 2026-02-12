/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0F172A',
          800: '#1E293B',
          700: '#334155',
          600: '#475569',
        },
        royal: {
          500: '#6D28D9',
          400: '#7C3AED',
          300: '#8B5CF6',
        },
        teal: {
          500: '#14B8A6',
          400: '#2DD4BF',
        },
        alert: {
          red: '#EF4444',
          gold: '#F59E0B',
        },
      },
    },
  },
  plugins: [],
};
