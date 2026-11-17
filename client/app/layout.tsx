import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../lib/auth-context';
import { ToastProvider } from '../components/Toast';
import { TimerProvider } from '../lib/timer-context';

export const metadata: Metadata = {
  title: 'TaskForge — Team Task Manager',
  description: 'Collaborative task management for modern teams',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <ToastProvider>
            <TimerProvider>
              {children}
            </TimerProvider>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}