import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import LayoutWrapper from './layout-wrapper';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'DumbAssets - Asset Management System',
  description: 'Comprehensive asset management and maintenance tracking system',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'DumbAssets',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    title: 'DumbAssets - Asset Management System',
    description: 'Comprehensive asset management and maintenance tracking system',
    siteName: 'DumbAssets',
  },
  twitter: {
    card: 'summary',
    title: 'DumbAssets - Asset Management System',
    description: 'Comprehensive asset management and maintenance tracking system',
  },
};

export const viewport: Viewport = {
  themeColor: '#3B82F6',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <LayoutWrapper>
          {children}
        </LayoutWrapper>
      </body>
    </html>
  );
}
