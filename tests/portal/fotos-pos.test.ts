import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FOTOS_POS, fotoDeCodigos, rutaFotoPos } from '@/lib/portal/fotos-pos';

const carpeta = join(process.cwd(), 'public', 'productos', 'pos');

describe('fotos del menú del POS', () => {
  it('cada código de la lista tiene su archivo y no sobra ninguno', () => {
    const archivos = readdirSync(carpeta).filter((f) => f.endsWith('.webp'));
    expect(archivos.map((f) => f.replace(/\.webp$/, '')).sort()).toEqual([...FOTOS_POS].sort());
    for (const codigo of FOTOS_POS)
      expect(existsSync(join(process.cwd(), 'public', rutaFotoPos(codigo)))).toBe(true);
  });

  it('la foto sale del código del POS, nunca del nombre', () => {
    expect(fotoDeCodigos(['CAKBANAPP'])).toEqual({
      codigo: 'CAKBANAPP',
      src: '/productos/pos/CAKBANAPP.webp',
    });
    expect(fotoDeCodigos(['NO-EXISTE'])).toBeNull();
    expect(fotoDeCodigos([])).toBeNull();
  });

  it('con varios códigos elige siempre el mismo (orden alfabético), sin importar el orden de llegada', () => {
    expect(fotoDeCodigos(['2AMEAPP', '2AM'])).toEqual(fotoDeCodigos(['2AM', '2AMEAPP']));
    expect(fotoDeCodigos(['2AMEAPP', '2AM'])?.codigo).toBe('2AM');
    expect(fotoDeCodigos(['NO-EXISTE', 'CAKBANAPP'])?.codigo).toBe('CAKBANAPP');
  });
});
