import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1280px' } },
    extend: {
      colors: {
        brand: {
          // مشتقة من فيروزي الشعار المعتمد #079EA5
          50: '#EAF8F8', 100: '#CDEFF0', 200: '#9EDFE1', 300: '#64CACE',
          400: '#2DB3B9', 500: '#079EA5', 600: '#067F86', 700: '#08666C', 800: '#0B5257', 900: '#0D2B2C',
        },
        accent: { 50: '#FFF3EA', 100: '#FFE3CF', 400: '#FF9A4D', 500: '#FF7916', 600: '#E8650A' }, // برتقالي الشعار
        ink: { DEFAULT: '#0D2B2C', soft: '#577172', muted: '#98AEAF' },
        mist: '#F1F7F7',
        line: '#E4EDED',
        surface: '#F6FAFA',
      },
      fontFamily: { sans: ['var(--font-readex)', 'system-ui', 'sans-serif'] },
      borderRadius: { card: '1.25rem' },
      boxShadow: {
        soft: '0 1px 2px rgba(15,45,58,.04), 0 8px 24px -8px rgba(15,45,58,.12)',
        lift: '0 2px 4px rgba(15,45,58,.06), 0 24px 48px -16px rgba(15,45,58,.28)',
        glow: '0 10px 30px -10px rgba(7,158,165,.55)',
        'glow-orange': '0 10px 30px -10px rgba(255,121,22,.55)',
        float: '0 18px 30px -10px rgba(13,43,44,.45)',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        shimmer: { '100%': { transform: 'translateX(-100%)' } },
        'pop-in': { '0%': { transform: 'scale(.6)', opacity: '0' }, '80%': { transform: 'scale(1.08)' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        'gradient-x': { '0%,100%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' } },
        'story-spin': { to: { transform: 'rotate(360deg)' } },
        'story-in': { '0%': { opacity: '0', transform: 'scale(.97)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        'slide-up': { '0%': { transform: 'translateY(16px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
      },
      animation: {
        float: 'float 5s ease-in-out infinite',
        shimmer: 'shimmer 1.6s infinite',
        'pop-in': 'pop-in .35s ease-out',
        'gradient-x': 'gradient-x 8s ease infinite',
        'story-spin': 'story-spin 1.2s linear infinite',
        'slide-up': 'slide-up .35s ease-out',
        'story-in': 'story-in .25s ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
