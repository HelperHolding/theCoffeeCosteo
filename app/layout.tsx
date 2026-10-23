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
    <html lang="es" className={`${texto.variable} ${titulo.variable}`} suppressHydrationWarning>
      <head>
        {/* Modo noche guardado (InterruptorLuz) y parpadeo del letrero solo en la primera carga de la sesión. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem("luz")==="noche")document.documentElement.setAttribute("data-luz","noche");if(sessionStorage.getItem("letrero"))return;sessionStorage.setItem("letrero","1");var h=document.documentElement;h.setAttribute("data-letrero","encender");setTimeout(function(){h.removeAttribute("data-letrero")},2000)}catch(e){}})()`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
