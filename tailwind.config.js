/** Same settings the pages used inline with the Tailwind CDN. */
module.exports = {
  content: ['./public/**/*.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          ink: '#26382f', muted: '#59685f', cream: '#f8f5ee', creamLight: '#fcfbfa',
          sage: '#dce7d9', sageLight: '#edf2e9', green: '#315d48', greenDark: '#203d30',
          accent: '#a96b46', accentLight: '#f5eee5', line: '#d9ded4'
        }
      },
      fontFamily: {
        sans: ['"DM Sans"', 'sans-serif'],
        display: ['"Fraunces"', 'serif']
      }
    }
  }
};
