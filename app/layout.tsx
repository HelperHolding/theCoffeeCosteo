import type { Metadata } from 'next';
import { Inter, Zen_Kaku_Gothic_New } from 'next/font/google';
import './globals.css';
const texto = Inter({ subsets: ['latin'], variable: '--font-texto', display: 'swap' });
const titulo = Zen_Kaku_Gothic_New({
  subsets: ['latin'],
  weight: ['500', '700', '900'],
  variable: '--font-titulo',
  display: 'swap',
});
export const metadata: Metadata = {
  title: 'The Coffee · Costeos',
  description: 'Recetas y costos por canal',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${texto.variable} ${titulo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
