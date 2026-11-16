/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#0a0a0b',
          panel: 'rgba(20, 20, 24, 0.72)',
          raised: 'rgba(32, 32, 38, 0.78)'
        },
        accent: {
          DEFAULT: '#8b7cff',
          soft: 'rgba(139, 124, 255, 0.18)'
        },
        line: 'rgba(255, 255, 255, 0.08)'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace']
      },
      backdropBlur: {
        xl: '24px'
      }
    }
  },
  plugins: []
}
