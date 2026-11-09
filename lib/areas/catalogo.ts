/**
 * Catálogo numérico de artículos para Areas (COD_ART es int y nuestros códigos del POS son texto). Vive en
 * datos/areas/articulos.json. Un número nunca se reasigna ni se borra.
 */
export interface Articulo {
  cod_art: number;
  /** Código del POS normalizado como bi_codigo (defaultCode o, si falta, el nombre). */
  codigo: string;
  descripcion: string;
  /** PRE_UNI más frecuente, en pesos; null si aún no se conoce. */
  precio: number | null;
}

export const PRIMER_CODIGO = 1001;

/** Igual que bi_codigo: upper(btrim(regexp_replace(replace(p, chr(160), ' '), '\s+', ' ', 'g'))). */
export const codigoNormal = (s: string) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();

export class Catalogo {
  private porCodigo = new Map<string, Articulo>();
  private agregados: Articulo[] = [];
  private siguiente: number;

  constructor(articulos: Articulo[] = []) {
    for (const a of articulos) {
      const codigo = codigoNormal(a.codigo);
      this.porCodigo.set(codigo, { ...a, codigo });
    }
    this.siguiente = Math.max(PRIMER_CODIGO - 1, ...articulos.map((a) => a.cod_art)) + 1;
  }

  codArt(codigo: string, descripcion: string): number {
    const c = codigoNormal(codigo);
    const existente = this.porCodigo.get(c);
    if (existente) {
      existente.descripcion = descripcion.trim();
      return existente.cod_art;
    }
    const nuevo: Articulo = { cod_art: this.siguiente++, codigo: c, descripcion: descripcion.trim(), precio: null };
    this.porCodigo.set(c, nuevo);
    this.agregados.push(nuevo);
    return nuevo.cod_art;
  }

  precioDe(codigo: string): number | null {
    return this.porCodigo.get(codigoNormal(codigo))?.precio ?? null;
  }

  fijarPrecio(codArt: number, precio: number) {
    for (const a of this.porCodigo.values()) if (a.cod_art === codArt) a.precio = precio;
  }

  nuevos(): Articulo[] {
    return [...this.agregados];
  }

  lista(): Articulo[] {
    return [...this.porCodigo.values()].sort((a, b) => a.cod_art - b.cod_art);
  }
}
