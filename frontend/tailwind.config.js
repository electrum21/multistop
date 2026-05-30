/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        identity: ['LTAIdentity', 'sans-serif'],
      }
    }
  },
  plugins: [],
  darkMode: 'class',
}
