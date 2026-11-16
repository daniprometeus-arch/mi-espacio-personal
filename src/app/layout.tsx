import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Mi espacio personal",
  description: "Tu centro privado de aprendizaje y organización.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
