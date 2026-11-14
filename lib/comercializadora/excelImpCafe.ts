import type { CorridaImp } from '../../supabase/functions/_shared/planImp.ts';
import type { CorridaCafe } from '../../supabase/functions/_shared/planCafe.ts';
import { CAFE_PROD } from '../../supabase/functions/_shared/impCafeCfg.ts';

/** Una hoja del libro: nombre y filas (las columnas salen de las llaves, como XLSX.utils.json_to_sheet). */
export interface Hoja {
  nombre: string;
  filas: Record<string, unknown>[];
}
export interface LibroExcel {
  archivo: string;
  hojas: Hoja[];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;

/**
 * _planCfgAplanar + _planCfgPlanaFilas sobre una sección (imp o cafe): una fila por parámetro, ordenadas por clave. Las
 * listas de números van por índice; las listas de objetos (los proveedores) se escriben como JSON.
 */
export function filasParametros(raiz: string, seccion: unknown, excluir?: string): Hoja['filas'] {
  const out: Record<string, unknown> = {};
  const aplanar = (o: X, pre: string) => {
    Object.keys(o || {}).forEach((k) => {
      const v = o[k],
        p = pre + '.' + k;
      if (Array.isArray(v)) {
        if (v.every((x) => x === null || typeof x !== 'object')) v.forEach((x, i) => (out[p + '.' + i] = x));
        else out[p] = JSON.stringify(v);
      } else if (v && typeof v === 'object') aplanar(v, p);
      else out[p] = v;
    });
  };
  aplanar(seccion, raiz);
  return Object.keys(out)
    .sort()
    .filter((k) => !excluir || k.indexOf(excluir) !== 0)
    .map((k) => ({ Parámetro: k, Valor: out[k] }));
}

/** window._impExportar: las siete hojas del sitio viejo, con el escenario que se está viendo. */
export function libroImportaciones(c: CorridaImp): LibroExcel | null {
  const S = c.S;
  if (!S) return null;
  const ped = S.productos.map((p: X) => {
    const q = p.quiebre;
    return {
      SKU: p.sku,
      Artículo: q.producto,
      Proveedor: q.proveedorNombre,
      Unidad: q.unidad,
      Inventario: q.stockHoy,
      'En camino': q.yaComprado,
      'Venta al mes (3 meses)': q.ventaMes3,
      'Meses que alcanza': q.mesesAlcanza,
      'Se acaba': q.seAcaba || q.seAcabaTexto,
      'Lead time': q.leadTime,
      'Pedir a más tardar': q.pedirATardar,
      'Colocar pedido': q.colocarPedido,
      'Llega a CEDIS': q.llegaCedis,
      'Días sin producto': q.diasSinProducto,
      Estado: q.estado,
      'Cantidad a pedir': q.cantidadPedir,
      Inversión: q.inversion,
      CBM: q.cbm,
      'Compra puente': q.compraPuente,
      Nota: q.nota,
    };
  });
  const cont = S.plan.contenedores.map((x: X) => ({
    '#': x.n,
    Colocar: x.colocar,
    Llega: x.llega,
    'Alcanza hasta': x.alcanzaHasta,
    'Días que alcanza': x.diasAlcanza,
    'CBM por día': x.cbmDia,
    Sucursales: x.sucursales,
    CBM: x.cbm,
    Inversión: x.inversion,
    Estado: x.estado,
  }));
  const cant = S.plan.cantidades.map((a: X) => {
    const o: Record<string, unknown> = { Artículo: a.producto, Alias: a.alias, 'CBM por caja': a.cbmCaja };
    a.porContenedor.forEach((q: number, j: number) => (o['C' + (j + 1)] = q));
    return o;
  });
  const proy = S.meses.map((m: X) => ({
    Mes: m.inicio,
    'Sucursales (inicio)': m.sucursalesInicio,
    Aperturas: m.aperturas,
    'CBM vasos y tapas': m.cbmVasosTapas,
    'CBM que llega': m.cbmQueLlega,
    'Stock al cierre (CBM)': m.stockVasosTapasCbm,
    'Inventario (días)': m.inventarioDiasCierre,
  }));
  const pu = S.productos
    .filter((p: X) => p.compraPuente.compraPuente > 0 || p.compraPuente.yaComprado > 0)
    .map((p: X) => {
      const cp = p.compraPuente;
      return {
        SKU: p.sku,
        Artículo: p.quiebre.producto,
        Inventario: cp.stockHoy,
        'Ya pedido': cp.yaComprado,
        Llega: cp.llega,
        'Venta hasta que llega': cp.ventaHastaLlegar,
        Faltante: cp.faltante,
        Colchón: cp.colchon,
        'Compra puente': cp.compraPuente,
        'Cómo cubrir': cp.comoCubrir,
      };
    });
  const red = c.ent.meta.red.filas.map((f: X, i: number) => ({
    'Mes #': i + 1,
    'Pipeline registrado': f.pipeline,
    'Plan de Dirección': f.plan,
    Cierres: f.cierres,
    Considerada: f.considerada,
    'De dónde': f.fuente,
  }));
  return {
    archivo: `Importaciones_${c.ent.P.fechaCorte}.xlsx`,
    hojas: [
      { nombre: 'Qué pedir', filas: ped },
      { nombre: 'Contenedores', filas: cont },
      { nombre: 'Cantidades por contenedor', filas: cant },
      { nombre: 'Proyección mensual', filas: proy },
      { nombre: 'Compra puente', filas: pu },
      { nombre: 'Aperturas consideradas', filas: red },
      { nombre: 'Parámetros', filas: filasParametros('imp', c.cfg.imp, 'imp.items.') },
    ],
  };
}

/** window._cafeExportar: las cuatro hojas del sitio viejo, con el escenario que se está viendo. */
export function libroCafe(c: CorridaCafe): LibroExcel | null {
  const R = c.R;
  if (!R) return null;
  const tl = R.timeline,
    lab = R.etiquetasMes,
    dm = R.detalleMensual;
  const mes: Hoja['filas'] = [];
  for (let i = 0; i < 12; i++)
    mes.push({
      Mes: lab[i],
      'White (esperado)': tl.grupos.White.esperado.mes[i],
      'Kraft (esperado)': tl.grupos.Kraft.esperado.mes[i],
      'Black (esperado)': tl.grupos.Black.esperado.mes[i],
      'Total esperado': tl.total.esperado.mes[i],
      Mínimo: tl.total.min.mes[i],
      Máximo: tl.total.max.mes[i],
      'A comprar (escenario activo)': dm.kgComprar.mes[i],
      'Sucursales al cierre': dm.sucursalesActivas[i],
      'Kg por sucursal': dm.kgPorSucursal[i],
    });
  const nom: Record<string, string> = {};
  CAFE_PROD.forEach((p) => (nom[p.id] = p.nombre));
  const pr = R.comparativa.porPresentacion.map((f: X) => ({
    Presentación: nom[f.id] || f.id,
    Bolsas: f.bolsas,
    Kg: f.kg,
    'Costo vigente': f.costoVigente,
    'Costo nuevo': f.costoNuevo,
    Ahorro: f.ahorro,
    'Ahorro %': f.ahorroPct,
  }));
  const ah = R.comparativa.mensual.map((m: X) => ({
    Mes: m.etiqueta,
    'Costo vigente': m.costoVigente,
    'Costo nuevo': m.costoNuevo,
    Ahorro: m.ahorro,
    'Ahorro acumulado': m.ahorroAcumulado,
  }));
  return {
    archivo: `Cafe_${c.cfg.cafe.anio}_${c.esc}.xlsx`,
    hojas: [
      { nombre: 'Kg por mes', filas: mes },
      { nombre: 'Presentaciones', filas: pr },
      { nombre: 'Ahorro por mes', filas: ah },
      { nombre: 'Parámetros', filas: filasParametros('cafe', c.cfg.cafe) },
    ],
  };
}
