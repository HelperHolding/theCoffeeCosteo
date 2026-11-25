// lib/comercializadora/configReporte.ts
import { type ConfigReporte, normalizarConfigReporte } from '../../supabase/functions/_shared/reporte/config.ts';

const LISTAS = ['excluir_ventas', 'corporativo_ap', 'excluir_saldos', 'excluir_saldos_sucursales', 'deuda_interna'] as const;
const METAS = ['fill', 'stock', 'pickeo', 'fisica', 'envio', 'dias_envio'] as const;
export type FormConfigReporte = Record<(typeof LISTAS)[number] | 'creditos_activos' | (typeof METAS)[number] | 'dias_incidencias', string>;

export function aFormulario(c: ConfigReporte): FormConfigReporte {
  return {
    ...(Object.fromEntries(LISTAS.map((k) => [k, c[k].join('\n')])) as Record<(typeof LISTAS)[number], string>),
    creditos_activos: c.creditos_activos.map((x) => [x.cliente, x.sucursal, x.nota].join(' | ')).join('\n'),
    ...(Object.fromEntries(METAS.map((k) => [k, String(c.metas[k])])) as Record<(typeof METAS)[number], string>),
    dias_incidencias: String(c.dias_incidencias),
  };
}

export function desdeFormulario(f: FormConfigReporte): ConfigReporte {
  const lineas = (t: string) => String(t ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return normalizarConfigReporte({
    ...Object.fromEntries(LISTAS.map((k) => [k, lineas(f[k])])),
    creditos_activos: lineas(f.creditos_activos).map((l) => {
      const [cliente = '', sucursal = '', nota = ''] = l.split('|').map((s) => s.trim());
      return { cliente, sucursal, nota };
    }),
    metas: Object.fromEntries(METAS.map((k) => [k, f[k].replace(',', '.')])),
    dias_incidencias: f.dias_incidencias,
  });
}
