/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Apple-inspired neutral palette
        background: {
          DEFAULT: '#ffffff',
          dark: '#0a0a0a',
          secondary: '#f5f5f5',
          'secondary-dark': '#1a1a1a',
          tertiary: '#e5e5e5',
          'tertiary-dark': '#262626',
        },
        foreground: {
          DEFAULT: '#000000',
          dark: '#ffffff',
          secondary: '#666666',
          'secondary-dark': '#a3a3a3',
          tertiary: '#999999',
          'tertiary-dark': '#737373',
        },
        // Accent colors (sparingly used)
        accent: {
          DEFAULT: '#007AFF', // Apple blue
          hover: '#0051D5',
          light: '#E6F2FF',
          'light-dark': '#003366',
        },
        success: {
          DEFAULT: '#34C759',
          light: '#E8F5E9',
          'light-dark': '#1B5E20',
        },
        warning: {
          DEFAULT: '#FF9500',
          light: '#FFF3E0',
          'light-dark': '#E65100',
        },
        error: {
          DEFAULT: '#FF3B30',
          light: '#FFEBEE',
          'light-dark': '#B71C1C',
        },
        // Glass morphism
        glass: {
          light: 'rgba(255, 255, 255, 0.8)',
          dark: 'rgba(28, 28, 30, 0.8)',
          border: 'rgba(0, 0, 0, 0.1)',
          'border-dark': 'rgba(255, 255, 255, 0.1)',
        },
        // Agent status colors
        agent: {
          idle: '#8E8E93',
          working: '#007AFF',
          success: '#34C759',
          error: '#FF3B30',
          offline: '#C7C7CC',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'SF Mono',
          'Monaco',
          'Inconsolata',
          'monospace',
        ],
      },
      fontSize: {
        '2xs': '0.625rem', // 10px
        'xs': '0.75rem',   // 12px
        'sm': '0.8125rem', // 13px - Apple standard
        'base': '0.9375rem', // 15px - Apple standard
        'lg': '1.0625rem', // 17px
        'xl': '1.1875rem', // 19px
        '2xl': '1.375rem', // 22px
        '3xl': '1.75rem',  // 28px
        '4xl': '2.25rem',  // 36px
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '30': '7.5rem',
      },
      borderRadius: {
        'apple': '0.75rem',    // 12px
        'apple-lg': '1rem',    // 16px
        'apple-xl': '1.25rem', // 20px
        'apple-2xl': '1.5rem', // 24px
      },
      boxShadow: {
        'apple': '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
        'apple-lg': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'apple-xl': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'glow': '0 0 20px rgba(0, 122, 255, 0.3)',
        'glow-success': '0 0 20px rgba(52, 199, 89, 0.3)',
        'glow-error': '0 0 20px rgba(255, 59, 48, 0.3)',
      },
      backdropBlur: {
        'apple': '20px',
      },
      transitionTimingFunction: {
        'apple': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'bounce-apple': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 3s ease-in-out infinite',
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateX(-10px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
