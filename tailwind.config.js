/** @type {import('tailwindcss').Config} */
// Every value here points at a CSS variable defined in src/renderer/src/index.css (:root).
// Change the theme there; components only use these semantic names.
export default {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      screens: {
        // Below this the sidebar collapses to an icon rail (window min width is 720px).
        compact: '860px'
      },
      colors: {
        bg: {
          base: 'rgb(var(--bg-base) / <alpha-value>)',
          panel: 'var(--bg-panel)',
          raised: 'var(--bg-raised)',
          inset: 'var(--bg-inset)',
          field: 'var(--bg-field)',
          hover: 'var(--bg-hover)'
        },
        fg: {
          DEFAULT: 'rgb(var(--fg) / <alpha-value>)',
          muted: 'var(--fg-muted)',
          subtle: 'var(--fg-subtle)',
          faint: 'var(--fg-faint)'
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          strong: 'var(--accent-strong)',
          soft: 'var(--accent-soft)',
          line: 'var(--accent-line)',
          fg: 'var(--on-accent)'
        },
        signal: 'rgb(var(--signal) / <alpha-value>)',
        danger: {
          DEFAULT: 'rgb(var(--danger) / <alpha-value>)',
          fg: 'var(--danger-fg)',
          soft: 'var(--danger-soft)'
        },
        success: 'rgb(var(--success) / <alpha-value>)',
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)'
        },
        ring: 'var(--ring)'
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI Variable', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'Consolas', 'ui-monospace', 'monospace']
      },
      fontSize: {
        // Smallest size in the system: uppercase labels and counters only, never body text.
        '2xs': ['0.6875rem', { lineHeight: '1rem' }]
      },
      borderRadius: {
        control: 'var(--radius-control)',
        card: 'var(--radius-card)',
        panel: 'var(--radius-panel)'
      },
      boxShadow: {
        glass: 'var(--shadow-glass)',
        raised: 'var(--shadow-raised)',
        glow: 'var(--shadow-glow)'
      },
      backdropBlur: {
        glass: 'var(--blur-glass)',
        xl: '24px'
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)'
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        base: 'var(--dur-base)',
        slow: 'var(--dur-slow)'
      }
    }
  },
  plugins: []
}
