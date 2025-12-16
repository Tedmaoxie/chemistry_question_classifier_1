import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: {
      main: '#1565C0', // Deep Scientific Blue (PKU/Academic style)
      light: '#5E92F3',
      dark: '#003C8F',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#00BFA5', // Modern Teal/Cyan accent
      light: '#5DF2D6',
      dark: '#008E76',
      contrastText: '#ffffff',
    },
    background: {
      default: '#F4F6F8', // Cool neutral background
      paper: '#FFFFFF',
    },
    text: {
      primary: '#1A2027', // Softer black
      secondary: '#5E6E79',
    },
  },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    h4: { fontWeight: 700, letterSpacing: '-0.02em', color: '#1565C0' },
    h5: { fontWeight: 600, letterSpacing: '-0.01em' },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 500, color: '#455A64' },
    button: { fontWeight: 600, textTransform: 'none' },
  },
  shape: {
    borderRadius: 12, // Modern rounded corners
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '8px',
          boxShadow: 'none',
          padding: '8px 20px',
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            transform: 'translateY(-1px)',
          },
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #1565C0 30%, #42A5F5 90%)', // Gradient for primary buttons
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        elevation1: {
          boxShadow: '0px 4px 20px rgba(0, 0, 0, 0.05)', // Soft diffuse shadow
        },
        outlined: {
          borderColor: '#E0E0E0',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0px 4px 20px rgba(0, 0, 0, 0.05)',
          border: '1px solid rgba(0,0,0,0.05)',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 700,
          backgroundColor: '#F5F7FA',
          color: '#455A64',
          borderBottom: '2px solid #E0E0E0',
        },
        root: {
          padding: '16px',
        },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
          border: '1px solid #E0E0E0',
          '&:before': { display: 'none' }, // Remove default divider
          '&.Mui-expanded': { margin: '0 0 16px 0' }, // Maintain spacing
        },
      },
    },
  },
});
