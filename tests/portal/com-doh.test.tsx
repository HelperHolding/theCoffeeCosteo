import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Doh } from '../../components/comercializadora/doh';
import { Inicio } from '../../components/comercializadora/inicio';
import { armarInicio } from '../../lib/comercializadora/inicio';
import {
  estadoInicial,
  filtrarDoh,
  riesgoInicio,
  type EstadoRiesgo,
  type FilaRiesgo,
} from '../../lib/comercializadora/doh';

const fila = (o: Partial<FilaRiesgo>): FilaRiesgo => ({
  sku: 'A',
  nombre: 'Vaso',
  cat: 'Desechables',
  prov: 'Vasos SA',
  fisico: 10,
  yulius: 0,
  comp: 0,
  inv: 10,
  cons: 2,
  lt: 7,
  oc: 0,
  llega: null,
  dias: 5,
  dLlega: null,
  estado: 'pedir',
  motivo: 'Sin OC',
  neg: false,
  vieja: false,
  esta: 0,
  costo: 1,
  ...o,
});
const FILAS = [
  fila({}),
  fila({ sku: 'B', nombre: 'Tapa', estado: 'confirmar', motivo: 'OC sin fecha de llegada', oc: 40 }),
  fila({ sku: 'C', nombre: 'Café', cat: 'Café', estado: 'ok', dias: 40, motivo: '' }),
  fila({
    sku: 'D',
    nombre: 'Popote',
    estado: 'sinventa',
    cons: 0,
    dias: null,
    motivo: '',
    fisico: -3,
    neg: true,
  }),
];
const conteos = (f: FilaRiesgo[]) =>
  Object.fromEntries(
    ['pedir', 'confirmar', 'cubierto', 'pronto', 'ok', 'sinventa'].map((e) => [
      e,
      f.filter((x) => x.estado === e).length,
    ]),
  ) as Record<EstadoRiesgo, number>;

describe('DOH (port de renderComDoh/_dohFilas)', () => {
  it('filtro inicial por la URL: urgente es pedir y lo desconocido es todos', () => {
    expect(estadoInicial('urgente')).toBe('pedir');
    expect(estadoInicial('confirmar')).toBe('confirmar');
    expect(estadoInicial('x')).toBe('todos');
    expect(estadoInicial(undefined)).toBe('todos');
  });

  it('filtra por estado, categoría y texto en nombre o SKU', () => {
    expect(filtrarDoh(FILAS, { estado: 'todos', cat: 'Café', q: '' }).map((r) => r.sku)).toEqual(['C']);
    expect(filtrarDoh(FILAS, { estado: 'confirmar', cat: 'todos', q: '' }).map((r) => r.sku)).toEqual(['B']);
    expect(filtrarDoh(FILAS, { estado: 'todos', cat: 'todos', q: 'TAP' }).map((r) => r.sku)).toEqual(['B']);
    expect(filtrarDoh(FILAS, { estado: 'todos', cat: 'todos', q: 'd' }).map((r) => r.sku)).toEqual(['D']);
  });

  it('pantalla: conteos por estado, estado inicial y los chips filtran', () => {
    render(<Doh filas={FILAS} conteos={conteos(FILAS)} ventana={30} inicial="pedir" />);
    expect(screen.getByText(/Venta de los últimos 30 días/)).toBeInTheDocument();
    const tabla = screen.getByRole('table');
    expect(within(tabla).getByText('Vaso')).toBeInTheDocument();
    expect(within(tabla).queryByText('Tapa')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /OC por confirmar/ }));
    expect(within(screen.getByRole('table')).getByText('OC sin fecha de llegada')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'todos' } });
    expect(within(screen.getByRole('table')).getByText('físico -3')).toHaveClass('text-bad');
  });

  it('sin coincidencias muestra "Sin resultados"', () => {
    render(<Doh filas={FILAS} conteos={conteos(FILAS)} ventana={30} inicial="todos" />);
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'zzz' } });
    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
  });
});

describe('Inicio: riesgo de quiebre y enlaces a DOH', () => {
  const r = armarInicio({
    hoy: '2026-11-13',
    catalogo: [],
    porEnviar: [],
    ventas90: [],
    compras: [],
    leadTimes: [],
    mermas: [],
    pedidos: [],
  });

  it('riesgoInicio: conteos y solo los primeros 7 por pedir o por confirmar', () => {
    const muchas = Array.from({ length: 10 }, (_, i) =>
      fila({ sku: 'X' + i, estado: i % 2 ? 'confirmar' : 'pedir' }),
    );
    const q = riesgoInicio({
      pedir: 5,
      confirmar: 5,
      cubierto: 0,
      negativos: 1,
      filas: [fila({ sku: 'OK', estado: 'ok' }), ...muchas],
    });
    expect(q.lista.map((x) => x.sku)).toEqual(['X0', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6']);
    expect([q.pedir, q.confirmar, q.negativos]).toEqual([5, 5, 1]);
  });

  it('muestra el panel con la lista y el enlace al DOH filtrado por "Pedir ya"', () => {
    const q = riesgoInicio({ pedir: 1, confirmar: 1, cubierto: 2, negativos: 0, filas: FILAS });
    render(<Inicio r={r} ventas hoy="2026-11-13" pedidos={null} riesgo={q} />);
    expect(screen.getByText('Riesgo de quiebre')).toBeInTheDocument();
    expect(screen.getByText('Tapa')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver en DOH/ })).toHaveAttribute(
      'href',
      '/comercializadora/doh?estado=pedir',
    );
    expect(screen.getAllByRole('link', { name: /Ver DOH/ })[0]).toHaveAttribute(
      'href',
      '/comercializadora/doh',
    );
  });

  it('si el motor no se pudo calcular, lo dice; sin el dato (pantallas viejas) no muestra el panel', () => {
    const { unmount } = render(<Inicio r={r} ventas hoy="2026-11-13" pedidos={null} riesgo={null} />);
    expect(screen.getByText('No se pudo calcular el riesgo de quiebre.')).toBeInTheDocument();
    unmount();
    render(<Inicio r={r} ventas hoy="2026-11-13" pedidos={null} />);
    expect(screen.queryByText('Riesgo de quiebre')).not.toBeInTheDocument();
  });
});
