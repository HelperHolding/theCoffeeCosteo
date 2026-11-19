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
  title: 'Helper Holding · The Coffee',
  description: 'Plataforma de Helper Holding: sucursales, ventas, costeo, CRM y abastos de The Coffee',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${texto.variable} ${titulo.variable}`} suppressHydrationWarning>
      <head>
        {/* Modo noche guardado (InterruptorLuz), aplicado antes de pintar. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem("luz")==="noche")document.documentElement.setAttribute("data-luz","noche")}catch(e){}})()`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
