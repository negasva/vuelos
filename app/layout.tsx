import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlightTracker Co",
  description: "Flight price tracking dashboard for Colombia",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}

