export type EscenarioPromo = {
  costo: number;
  unidades: number;
  precio: number;
  descuento: number;
  iva: number;
  comision: number;
  baseComision: 'con-iva' | 'sin-iva';
  extra: number;
  objetivo: number;
};

/** Todos los cálculos conservan precisión; se redondea solo para mostrar. */
export function simularPromocion(e: EscenarioPromo) {
  if (
    !Object.values(e).every((v) => typeof v !== 'number' || Number.isFinite(v)) ||
    e.costo < 0 ||
    e.unidades <= 0 ||
    !Number.isInteger(e.unidades) ||
    e.precio <= 0 ||
    e.descuento < 0 ||
    e.descuento >= 100 ||
    e.iva < 0 ||
    e.iva > 100 ||
    e.comision < 0 ||
    e.comision >= 100 ||
    e.extra < 0 ||
    e.objetivo < 0 ||
    e.objetivo >= 100 ||
    !['con-iva', 'sin-iva'].includes(e.baseComision)
  )
    return null;
  const cobro = e.precio * (1 - e.descuento / 100),
    neto = cobro / (1 + e.iva / 100),
    costo = e.costo * e.unidades;
  const comision = (e.baseComision === 'con-iva' ? cobro : neto) * (e.comision / 100);
  const bruto = neto - costo,
    contribucion = bruto - comision - e.extra;
  const factorBase = e.baseComision === 'con-iva' ? 1 : 1 / (1 + e.iva / 100);
  const divisor = (1 - e.objetivo / 100) / (1 + e.iva / 100) - (factorBase * e.comision) / 100;
  const equilibrio = 1 / (1 + e.iva / 100) - (factorBase * e.comision) / 100;
  const ceilCent = (v: number) => Math.ceil(v * 100 - 1e-8) / 100;
  const precioObjetivo = divisor > 0 ? ceilCent((costo + e.extra) / divisor / (1 - e.descuento / 100)) : null;
  const precioEquilibrio =
    equilibrio > 0 ? ceilCent((costo + e.extra) / equilibrio / (1 - e.descuento / 100)) : null;
  return {
    cobro,
    neto,
    costo,
    comision,
    bruto,
    margenBruto: bruto / neto,
    contribucion,
    margen: contribucion / neto,
    precioObjetivo,
    precioEquilibrio,
  };
}
