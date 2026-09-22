import { alpha, createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#8b5cf6',
      light: '#a78bfa',
      dark: '#6d28d9',
    },
    secondary: {
      main: '#22d3ee',
    },
    success: {
      main: '#34d399',
    },
    warning: {
      main: '#fbbf24',
    },
    error: {
      main: '#fb7185',
    },
    background: {
      default: '#08090d',
      paper: '#11131a',
    },
    text: {
      primary: '#f7f7fb',
      secondary: '#9ca3b4',
    },
    divider: 'rgba(255,255,255,0.08)',
  },
  shape: {
    borderRadius: 16,
  },
  typography: {
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: {
      fontSize: '1.35rem',
      lineHeight: 1.15,
      fontWeight: 800,
      letterSpacing: '-0.035em',
    },
    h2: {
      fontSize: '1rem',
      lineHeight: 1.25,
      fontWeight: 750,
      letterSpacing: '-0.015em',
    },
    body1: {
      fontSize: '0.92rem',
    },
    body2: {
      fontSize: '0.82rem',
    },
    caption: {
      fontSize: '0.73rem',
    },
    button: {
      fontWeight: 750,
      letterSpacing: '-0.01em',
      textTransform: 'none',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: '#303444 transparent',
        },
        '*::-webkit-scrollbar': {
          width: 8,
          height: 8,
        },
        '*::-webkit-scrollbar-thumb': {
          background: '#303444',
          borderRadius: 999,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 16px 50px rgba(0,0,0,0.20)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          minHeight: 38,
          borderRadius: 12,
          paddingInline: 14,
        },
        containedPrimary: {
          boxShadow: '0 10px 28px rgba(139,92,246,0.22)',
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          height: 28,
          borderRadius: 9,
          fontWeight: 650,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          background: 'rgba(255,255,255,0.035)',
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(255,255,255,0.18)',
          },
          '&.Mui-focused': {
            background: alpha('#8b5cf6', 0.06),
          },
        },
        notchedOutline: {
          borderColor: 'rgba(255,255,255,0.09)',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: 10,
          background: '#1d2030',
        },
      },
    },
  },
});
