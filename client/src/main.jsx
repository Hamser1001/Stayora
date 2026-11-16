import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import './i18n';
import './index.css';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ThemeProvider } from './contexts/ThemeContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <SettingsProvider>
            <App />
            <Toaster
            position="top-right"
            closeButton
            toastOptions={{
              classNames: {
                toast: 'font-sans !rounded-xl !border-border !bg-popover !text-popover-foreground',
                title: '!text-[13px] !font-semibold',
                description: '!text-[11.5px] !text-muted-foreground',
              },
            }}
            />
          </SettingsProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
