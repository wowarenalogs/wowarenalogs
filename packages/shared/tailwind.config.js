module.exports = {
  content: ['./components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        fadein: 'fadein 0.25s ease-in',
        loader: 'loader 0.35s ease-in',
      },
      keyframes: {
        fadein: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        loader: {
          '0%': { opacity: 0 },
          '30%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography'), require('daisyui')],
  daisyui: {
    themes: ['halloween'],
  },
};
