/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      screens: {
        'xs': '375px'
      },
      maxWidth: {
        '7xl': '80rem'
      },
      height: {
        'dvh': '100dvh'
      },
      minHeight: {
        'dvh': '100dvh'
      },
      maxHeight: {
        'dvh': '100dvh'
      },
      gridTemplateRows: {
        'subgrid': 'subgrid'
      }
    }
  },
  plugins: []
};
