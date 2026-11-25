import { Encabezado } from '../../../components/portal/piezas';
import { Corrida } from '../../../components/sucursales-propias/pagos/corrida';
import { SubirZip } from '../../../components/sucursales-propias/pagos/subir-zip';
import type { AccionesPagos, FilaVista } from '../../../components/sucursales-propias/pagos/tipos';

/**
 * Pagos de Sucursales propias con DATOS SINTÉTICOS (?pagos-propias): nombres ficticios, sin CLABEs y
 * con acciones falsas que responden tras una pausa corta. &solo-lectura=1 oculta aplicar y la subida.
 */
const lectura = new URLSearchParams(window.location.search).get('solo-lectura') === '1';
const espera = <T,>(v: T, ms = 600) => new Promise<T>((ok) => setTimeout(() => ok(v), ms));

const base: FilaVista = {
  id: 0,
  llave: 'F',
  tipo: 'SPEI',
  alias: '',
  concepto: 'PAGO FACTURAS',
  monto: 0,
  fecha: '2026-11-20',
  estado: 'cuadra',
  error: null,
  proveedorId: 'v1',
  proveedorNombre: null,
  sugerido: false,
  pagoId: null,
  reciboUrl: null,
  aplicadoEn: null,
  asignaciones: [],
};
const asig = (n: string, monto: number, saldo = monto) => ({
  billId: `b${n}`,
  numero: n,
  ubicacion: 'SUCURSAL DEMO CENTRO',
  fecha: '2026-11-06',
  saldo,
  monto,
});
const filas: FilaVista[] = [
  {
    ...base,
    id: 1,
    alias: 'LACTEOS DEMO',
    monto: 1250.5,
    proveedorNombre: 'Lácteos Demo SA',
    asignaciones: [asig('1001', 1250.5)],
  },
  {
    ...base,
    id: 2,
    alias: 'EMPAQUES EJEMPLO',
    monto: 800,
    proveedorNombre: 'Empaques Ejemplo SA de CV',
    sugerido: true,
    asignaciones: [asig('1002', 500), asig('1003', 300)],
  },
  {
    ...base,
    id: 3,
    alias: 'PANADERIA MUESTRA',
    monto: 900,
    estado: 'no_cuadra',
    proveedorNombre: 'Panadería Muestra',
    asignaciones: [asig('1004', 700, 700)],
  },
  { ...base, id: 4, alias: 'PROVEEDOR NUEVO', monto: 450, estado: 'desconocido', proveedorId: null },
  {
    ...base,
    id: 5,
    alias: 'SERVICIOS PRUEBA',
    monto: 300,
    estado: 'sin_facturas',
    proveedorNombre: 'Servicios Prueba',
  },
  {
    ...base,
    id: 6,
    alias: 'FRUTAS FICTICIAS',
    monto: 620,
    estado: 'error',
    error: 'Zoho: proveedor inactivo',
    proveedorNombre: 'Frutas Ficticias',
  },
  {
    ...base,
    id: 7,
    alias: 'ABARROTES DEMO',
    monto: 1500,
    estado: 'aplicada_sin_adjunto',
    error: 'No se pudo adjuntar el recibo',
    proveedorNombre: 'Abarrotes Demo',
    pagoId: 'pago-demo-1',
    aplicadoEn: '2026-11-21T16:00:00Z',
    asignaciones: [asig('1005', 1500)],
  },
  {
    ...base,
    id: 8,
    alias: 'CAFE MUESTRA',
    monto: 2100,
    estado: 'aplicada',
    proveedorNombre: 'Café Muestra',
    pagoId: 'pago-demo-2',
    reciboUrl: '#recibo',
    aplicadoEn: '2026-11-21T16:05:00Z',
    asignaciones: [asig('1006', 2100)],
  },
];

const proveedores = [
  { id: 'p1', nombre: 'Proveedor Nuevo SA' },
  { id: 'p2', nombre: 'Distribuidora Ficticia' },
];
const acciones: AccionesPagos = {
  aplicar: async () => espera({ ok: true as const, estado: 'aplicada' }),
  asignarProveedor: async () => espera({ ok: true as const }),
  guardarAsignaciones: async () => espera({ ok: true as const }),
  leerProveedores: async () => espera({ ok: true as const, proveedores }),
  leerFacturasProveedor: async () =>
    espera({
      ok: true as const,
      facturas: [
        {
          billId: 'b1004',
          numero: '1004',
          ubicacion: 'SUCURSAL DEMO CENTRO',
          fecha: '2026-11-06',
          saldo: 700,
          vendorId: 'v1',
          vencimiento: '2026-12-06',
          notas: '',
        },
        {
          billId: 'b1007',
          numero: '1007',
          ubicacion: 'SUCURSAL DEMO NORTE',
          fecha: '2026-11-10',
          saldo: 200,
          vendorId: 'v1',
          vencimiento: '2026-12-10',
          notas: '',
        },
      ],
    }),
};

export function VistaPagosPropias() {
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4">
      <p className="aviso">PRUEBA VISUAL · DATOS SINTÉTICOS · Sin Auth ni conexión a bases de datos</p>
      <Encabezado
        area="Sucursales propias · Helper Holding"
        titulo="Corrida #1"
        descripcion="demo.zip · 8 recibos por $7,920.50 · 1/8 aplicadas"
      />
      {lectura ? null : <SubirZip />}
      <Corrida filas={filas} puedeAplicar={!lectura} acciones={acciones} zohoOrg="1" />
    </main>
  );
}
