// Zoho Books de la org Sucursales The Coffee – GDL (spec pagos de Sucursales propias §5). Credenciales propias,
// separadas de las de Comercializadora, y bandera de escritura propia (SUC_PAGOS_EFECTOS).
import { ZohoClient } from "./zoho.ts";

export const sucEfectos = (): boolean => Deno.env.get("SUC_PAGOS_EFECTOS") === "si";

export function zohoSucDesdeEnv(): ZohoClient {
  const v = (k: string) => {
    const x = Deno.env.get(k);
    if (!x) throw new Error(`Falta el secreto ${k}`);
    return x;
  };
  return new ZohoClient({
    clientId: v("ZOHO_SUC_CLIENT_ID"), clientSecret: v("ZOHO_SUC_CLIENT_SECRET"),
    refreshToken: v("ZOHO_SUC_REFRESH_TOKEN"), orgId: v("ZOHO_SUC_ORG_ID"),
    soloLectura: !sucEfectos(),
  });
}
