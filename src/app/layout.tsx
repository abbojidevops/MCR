import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MCR — Missed Call Revenue Recovery for Local Service Businesses',
  description:
    'Turn missed customer calls into booked service jobs automatically with instant SMS text-back and trade-specific qualification.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
