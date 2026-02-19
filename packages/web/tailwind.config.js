module.exports = {
  presets: [require('../shared/tailwind.config')],
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    '../shared/src/components/**/*.{js,ts,jsx,tsx}',
  ],
};
