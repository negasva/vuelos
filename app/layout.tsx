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

function getThemeScript() {
  // Avoid hard failures in browsers that block storage access.
  return `(function(){try{var t=window.localStorage&&window.localStorage.getItem('flighttracker_theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}document.documentElement.style.backgroundColor='#1b1c1e';}catch(e){document.documentElement.style.backgroundColor='#1b1c1e';}})();`;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: getThemeScript() }} />
      </head>
      <body style={{ background: "var(--bg)" }}>{children}</body>
    </html>
  );
}
