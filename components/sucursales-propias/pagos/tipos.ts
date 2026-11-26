import type { EstadoTransferencia } from '@/lib/sucursales-propias/estados';
import type { Factura, Proveedor } from '@/lib/sucursales-propias/empate';

type R<T = object> = { error: string } | ({ ok: true } & T);

export interface FilaVista {
  id: number;
  llave: string;
  tipo: string;
  alias: string;
  concepto: string;
  monto: number;
  fecha: string;
  estado: EstadoTransferencia;
  error: string | null;
  proveedorId: string | null;
  proveedorNombre: string | null;
  sugerido: boolean;
  pagoId: string | null;
  reciboUrl: string | null;
  aplicadoEn: string | null;
  asignaciones: {
    billId: string;
    numero: string;
    ubicacion: string;
    fecha: string | null;
    saldo: number;
    monto: number;
  }[];
}

/** Server actions de acciones.ts, pasadas como props (así los componentes se prueban sin el servidor). */
export interface AccionesPagos {
  aplicar: (id: number) => Promise<R<{ estado: string; mensaje?: string }>>;
  asignarProveedor: (id: number, p: Proveedor) => Promise<R>;
  guardarAsignaciones: (id: number, a: { billId: string; monto: number }[]) => Promise<R>;
  leerProveedores: () => Promise<R<{ proveedores: Proveedor[] }>>;
  leerFacturasProveedor: (id: number) => Promise<R<{ facturas: Factura[] }>>;
}
