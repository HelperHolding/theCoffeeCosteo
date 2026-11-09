/**
 * Catálogo numérico de artículos para Areas (COD_ART es int y nuestros códigos del POS son texto). Vive en
 * datos/areas/articulos.json. Un número nunca se reasigna ni se borra.
 */
export interface Articulo {
  cod_art: number;
  /** Código del POS normalizado como bi_codigo (defaultCode o, si falta, el nombre). */
  codigo: string;
  descripcion: string;
  /** Precio de lista más frecuente del producto (sin modificadores), en pesos; null si aún no se conoce. */
  precio: number | null;
}

export const PRIMER_CODIGO = 1001;

/** Igual que bi_codigo: upper(btrim(regexp_replace(replace(p, chr(160), ' '), '\s+', ' ', 'g'))). */
export const codigoNormal = (s: string) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();

export class Catalogo {
  private porCodigo = new Map<string, Articulo>();
  private agregados: Articulo[] = [];
  private siguiente: number;
  /** Precios de lista vistos en la corrida actual (por código normalizado), antes de armar los tickets. */
  private observados = new Map<string, number>();
  /** Cambios de la transacción abierta, para deshacerlos si el ticket se descarta. */
  private deshacer: (() => void)[] | null = null;

  /** Abre una transacción: los códigos y descripciones que se toquen hasta `confirmar` o `revertir`. */
  iniciar() {
    this.deshacer = [];
  }
  confirmar() {
    this.deshacer = null;
  }
  revertir() {
    for (const f of (this.deshacer ?? []).reverse()) f();
    this.deshacer = null;
  }

  /** Precios de lista de esta corrida. Fija el precio de los artículos ya conocidos y de los que se den de alta. */
  observarPrecios(precios: Map<string, number>) {
    for (const [codigo, precio] of precios) this.observados.set(codigoNormal(codigo), precio);
    for (const a of this.porCodigo.values()) {
      const p = this.observados.get(a.codigo);
      if (p !== undefined) a.precio = p;
    }
  }

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
      const antes = existente.descripcion;
      this.deshacer?.push(() => (existente.descripcion = antes));
      existente.descripcion = descripcion.trim();
      return existente.cod_art;
    }
    const nuevo: Articulo = {
      cod_art: this.siguiente++,
      codigo: c,
      descripcion: descripcion.trim(),
      precio: this.observados.get(c) ?? null,
    };
    this.porCodigo.set(c, nuevo);
    this.agregados.push(nuevo);
    this.deshacer?.push(() => {
      this.porCodigo.delete(c);
      this.agregados.pop();
      this.siguiente--;
    });
    return nuevo.cod_art;
  }

  precioDe(codigo: string): number | null {
    const c = codigoNormal(codigo);
    return this.observados.get(c) ?? this.porCodigo.get(c)?.precio ?? null;
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
