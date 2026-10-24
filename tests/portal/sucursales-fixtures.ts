/** Fixtures SINTÉTICOS con la forma observada de la API The Coffee (sin datos reales). */
export interface PedidoApi {
  id: number;
  companyId: number;
  lookerStoreId?: number;
  fromSmartphone: boolean | null;
  netAmout: number;
  grossAmount: number;
  percentageOfTransfer: number | null;
  refundId: string | null;
  discount: number;
  paymentMethod: string;
  paymentType: string;
  items: {
    defaultCode: string | null;
    productName: string;
    amount: number;
    discount: number;
    itemsCustom: { defaultCode: string; productName: string; amount: number; discount: number }[];
  }[];
  createdAt: string;
}

let siguienteId = 1000;
/** Pedido de mostrador con un latte (77 + leche de avena 13) y un brownie de 75: gross 165. */
export function pedido(fecha: string, hora: string, extra: Partial<PedidoApi> = {}): PedidoApi {
  return {
    id: siguienteId++,
    companyId: 612,
    lookerStoreId: 477,
    fromSmartphone: false,
    netAmout: 165,
    grossAmount: 165,
    percentageOfTransfer: 100,
    refundId: 'uuid-sintetico',
    discount: 0,
    paymentMethod: 'CARTAO',
    paymentType: 'CONTACTLESS_EMV',
    items: [
      {
        defaultCode: '4MIL',
        productName: 'Matcha Iced Latte',
        amount: 77,
        discount: 0,
        itemsCustom: [
          { defaultCode: 'LVG', productName: 'Oatmilk', amount: 13, discount: 0 },
          { defaultCode: 'TRADICAPP', productName: 'Regular - 440ml', amount: 0, discount: 0 },
        ],
      },
      { defaultCode: 'BRO13', productName: 'Brownie', amount: 75, discount: 0, itemsCustom: [] },
    ],
    createdAt: `${fecha}T${hora}.000Z`,
    ...extra,
  };
}

export const envelope = (data: unknown[], pagina: number, porPagina: number, total: number) => ({
  currentPage: pagina,
  totalItems: total,
  totalPages: Math.ceil(total / porPagina),
  perPage: porPagina,
  from: (pagina - 1) * porPagina + 1,
  to: Math.min(pagina * porPagina, total),
  data,
});

export const catalogo = [
  { id: 477, name: 'The Coffee Ciudad Granja', lookerStoreId: 382 },
  { id: 612, name: 'The Coffee Cd. Juárez', lookerStoreId: 477 },
];

/**
 * fetch falso: sirve el catálogo y pedidos por fecha (orden desc, paginados como la API real).
 * Registra cada URL y cada header Authorization para verificar que el token no viaja en la URL.
 */
export function apiFalsa(porFecha: Record<string, PedidoApi[]>) {
  const llamadas: { url: string; auth: string | null }[] = [];
  const fetchFalso = async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(entrada));
    llamadas.push({ url: url.toString(), auth: new Headers(init?.headers).get('authorization') });
    if (url.pathname === '/company/list/all') return Response.json(catalogo);
    const m = /^\/order\/company\/(\d+)$/.exec(url.pathname);
    if (!m) return new Response('no', { status: 404 });
    if (Number(m[1]) !== 612)
      return Response.json({ statusCode: 404, message: 'company not found' }, { status: 404 });
    const desde = url.searchParams.get('dateStart')!;
    const hasta = url.searchParams.get('dateEnd')!;
    const por = Number(url.searchParams.get('perPage'));
    const pag = Number(url.searchParams.get('page'));
    const todos = Object.entries(porFecha)
      .filter(([f]) => f >= desde && f <= hasta)
      .flatMap(([, ps]) => ps)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return Response.json(envelope(todos.slice((pag - 1) * por, pag * por), pag, por, todos.length));
  };
  return { fetch: fetchFalso as typeof fetch, llamadas };
}
