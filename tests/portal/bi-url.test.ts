import { describe, expect, it } from 'vitest';
import { OPCIONES_FR, aFiltrosBi, escribirUrl, hoyMexico, leerUrl, resolverPeriodo } from '@/lib/bi/url';
import zoho from '../../docs/bi/zoho/filtros.json';

const vacio = () => leerUrl(new URLSearchParams());

describe('URL ↔ filtros', () => {
  it('sin parámetros: Esta semana y listas vacías', () => {
    const f = vacio();
    expect(f.fr).toBe('esta-semana');
    expect(f.companias).toEqual([]);
    expect(escribirUrl(f).toString()).toBe('');
  });

  it('ida y vuelta de los 17 filtros', () => {
    const q = new URLSearchParams(
      'fr=mes-anterior&comp=si&anios=1,2&dias=1,5&tiendas=384,532&franq=CDMX-MJA&tipo=Franquicia&cat=Fraps' +
        '&grupo=Bebida&cafe=no&prod=Iced%20Latte,Brownie%252C%20chico&pago=APP%20-%20WALLET&hora=8,9&mad=Mayor%20de%203%20meses' +
        '&min=10&max=250.5&sem=W45%202026',
    );
    const f = leerUrl(q);
    expect(f).toMatchObject({
      fr: 'mes-anterior', comparable: true, aniosOperando: [1, 2], dias: [1, 5], companias: [384, 532],
      franquiciatarios: ['CDMX-MJA'], tipos: ['Franquicia'], categorias: ['Fraps'], grupos: ['Bebida'], cafe: ['No'],
      productos: ['Iced Latte', 'Brownie, chico'], pagos: ['APP - WALLET'], horas: [8, 9],
      maduracion: ['Mayor de 3 meses'], montoMin: 10, montoMax: 250.5, semanas: ['W45 2026'],
    });
    expect(leerUrl(escribirUrl(f))).toEqual(f);
  });

  it('el rango de fechas le gana a la relativa', () => {
    const f = leerUrl(new URLSearchParams('fr=hoy&desde=2026-10-01&hasta=2026-10-07'));
    expect(f.fr).toBeUndefined();
    expect(resolverPeriodo(f, '2026-11-05')).toEqual({ ok: true, desde: '2026-10-01', hasta: '2026-10-07' });
  });

  it('descarta basura sin reventar', () => {
    const f = leerUrl(new URLSearchParams('fr=nada&tiendas=abc,384,-2&dias=9,1&hora=25,7&min=-5&max=x&comp=quiza&cafe=tal'));
    expect(f.fr).toBe('esta-semana');
    expect(f.companias).toEqual([384]);
    expect(f.dias).toEqual([1]);
    expect(f.horas).toEqual([7]);
    expect(f.montoMin).toBeUndefined();
    expect(f.montoMax).toBeUndefined();
    expect(f.comparable).toBeUndefined();
    expect(f.cafe).toEqual([]);
  });

  it('periodo inválido o de más de 1,100 días', () => {
    expect(resolverPeriodo(leerUrl(new URLSearchParams('desde=2026-10-07&hasta=2026-10-01')), '2026-11-05').ok).toBe(false);
    expect(resolverPeriodo(leerUrl(new URLSearchParams('desde=2020-01-01&hasta=2026-10-01')), '2026-11-05').ok).toBe(false);
    expect(resolverPeriodo(leerUrl(new URLSearchParams('desde=2026-02-30&hasta=2026-03-01')), '2026-11-05').ok).toBe(false);
  });

  it('las 15 opciones de Fecha Relativa son las de Zoho', () => {
    expect(OPCIONES_FR.map((o) => o.etiqueta)).toEqual(zoho.fechaRelativa);
    for (const o of OPCIONES_FR) expect(resolverPeriodo({ ...vacio(), fr: o.clave }, '2026-11-05').ok).toBe(true);
  });

  it('hoy en hora de México, no en UTC', () => {
    expect(hoyMexico(new Date('2026-11-06T05:30:00Z'))).toBe('2026-11-05'); // 23:30 en CDMX
    expect(hoyMexico(new Date('2026-11-06T06:30:00Z'))).toBe('2026-11-06');
  });

  it('aFiltrosBi pasa las compañías efectivas y el periodo', () => {
    const f = leerUrl(new URLSearchParams('cafe=si&min=10'));
    expect(aFiltrosBi(f, { desde: '2026-11-02', hasta: '2026-11-05' }, [384], '2026-11-05')).toMatchObject({
      desde: '2026-11-02', hasta: '2026-11-05', companias: [384], cafe: ['Sí'], montoMin: 10, hoy: '2026-11-05',
    });
  });
});

describe('leerUrl listas de texto', () => {
  it('quita duplicados: prod=A,A → [A]', () => {
    expect(leerUrl(new URLSearchParams('prod=A,A')).productos).toEqual(['A']);
  });
});
