/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        base: 'var(--surface-base)',
        raised: 'var(--surface-raised)',
        gold: 'var(--accent-gold)',
        coral: 'var(--accent-coral)',
        teal: 'var(--accent-teal)',
        primary: 'var(--text-primary)',
        moss: 'var(--terrain-moss)',
        stone: 'var(--terrain-stone)',
        sand: 'var(--terrain-sand)',
        water: 'var(--terrain-water)',
        detected: 'var(--state-detected)',
        rejected: 'var(--state-rejected)',
      },
      borderRadius: {
        badge: 'var(--radius-badge)',
        card: 'var(--radius-card)',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        meta: ['var(--font-meta)'],
      },
    },
  },
  plugins: [],
};
