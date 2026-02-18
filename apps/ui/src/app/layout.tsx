'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Layout/Sidebar';
import StatusBar from '@/components/Layout/StatusBar';
import { DaemonProvider } from '@/contexts/DaemonContext';
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <DaemonProvider>
          <div className="app-container">
            <Sidebar />
            <main className="main-content">
              {children}
            </main>
            <StatusBar />
          </div>
        </DaemonProvider>
      </body>
    </html>
  );
}
