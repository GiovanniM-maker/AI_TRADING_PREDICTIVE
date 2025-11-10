import "./globals.css";

export const metadata = {
  title: "AI Trading Predictive",
  description: "Piattaforma AI Trading con autenticazione Firebase.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body className="min-h-screen bg-black text-white">{children}</body>
    </html>
  );
}

