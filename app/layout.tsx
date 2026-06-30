import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlightTracker Co — Rastreador de vuelos",
  description:
    "Monitorea rutas, detecta tarifas error y recibe alertas de Telegram cuando el precio de tu vuelo cae.",
};

export const viewport: Viewport = {
  themeColor: "#f3f4fb",
  width: "device-width",
  initialScale: 1,
};

// Set the saved theme before paint to avoid a flash of the wrong theme.
const themeScript = `(function(){try{var t=localStorage.getItem('flighttracker_theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
