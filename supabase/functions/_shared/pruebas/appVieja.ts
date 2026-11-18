// deno-lint-ignore-file no-explicit-any
// Evalúa funciones del HTML viejo aisladas, para las pruebas de paridad del motor (plan 3d). COM_APP_VIEJA apunta al
// app/index.html de producción (`git show a9e4a22:app/index.html`). Sin ella, las pruebas de paridad se omiten.
export const RUTA_APP = Deno.env.get("COM_APP_VIEJA");
export const SIN_APP = !RUTA_APP;
const APP = RUTA_APP ? await Deno.readTextFile(RUTA_APP) : "";

/** Código fuente de una declaración top-level de la app (function / var / const) por nombre, con balanceo de llaves. */
export function fuente(nombre: string): string {
  const re = new RegExp(`(?:^|\\n)((?:async )?function ${nombre}\\(|(?:var|const) ${nombre}\\s*=)`);
  const m = re.exec(APP);
  if (!m) throw new Error("No encontré " + nombre + " en app/index.html");
  const ini = m.index + m[0].indexOf(m[1]);
  const esFn = m[1].includes("function");
  let depth = 0, vioCuerpo = false;
  for (let i = ini; i < APP.length; i++) {
    const c = APP[i];
    if (c === "'" || c === '"' || c === "`") {
      for (i++; i < APP.length && APP[i] !== c; i++) if (APP[i] === "\\") i++;
      continue;
    }
    if (c === "/" && APP[i + 1] === "/") { while (APP[i] !== "\n") i++; continue; }
    if (c === "/" && APP[i + 1] === "*") { i = APP.indexOf("*/", i) + 1; continue; }
    if (c === "{" || c === "(" || c === "[") { depth++; if (c === "{") vioCuerpo = true; }
    else if (c === "}" || c === ")" || c === "]") {
      depth--;
      if (esFn && depth === 0 && c === "}" && vioCuerpo) return APP.slice(ini, i + 1);
    } else if (!esFn && depth === 0 && c === ";") return APP.slice(ini, i + 1);
  }
  throw new Error("Declaración sin cierre: " + nombre);
}

// Hora local de Ciudad de México (UTC−6 fijo desde 2022) y Date.now() fijo, para evaluar la app como en el navegador del
// equipo sin depender de la zona ni del reloj de la máquina que corre las pruebas.
const OFF = 6 * 3600e3;
export function claseFecha(ahora: number) {
  return class DateCdmx extends Date {
    constructor(...a: any[]) {
      if (a.length === 0) super(ahora);
      else if (a.length === 1) super(a[0] instanceof Date ? a[0].getTime() : a[0]);
      else super(Date.UTC(a[0], a[1], a[2] ?? 1, a[3] ?? 0, a[4] ?? 0, a[5] ?? 0, a[6] ?? 0) + OFF);
    }
    static override now() { return ahora; }
    private l() { return new Date(this.getTime() - OFF); }
    override getFullYear() { return this.l().getUTCFullYear(); }
    override getMonth() { return this.l().getUTCMonth(); }
    override getDate() { return this.l().getUTCDate(); }
    override getHours() { return this.l().getUTCHours(); }
    override setHours(h: number, m = 0, s = 0, ms = 0) {
      const l = this.l(); l.setUTCHours(h, m, s, ms); return this.setTime(l.getTime() + OFF);
    }
  };
}
/** Instante de `hoy` (YYYY-MM-DD) a la hora dada de CDMX. */
export const instanteCdmx = (hoy: string, hora = 10) =>
  Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10), hora) + OFF;

/** La app evaluada aislada: `stubs` primero, luego cada declaración de `nombres`, con "ahora" = hoy a la hora de CDMX. */
export function app(nombres: string[], stubs: string, hoy: string, hora = 10): any {
  const src = stubs + "\n" + nombres.map(fuente).join("\n") + "\nreturn{" + nombres.map((n) => n + ":" + n).join(",") + "};";
  return new Function("Date", src)(claseFecha(instanteCdmx(hoy, hora)));
}

/** Generador determinista. */
export function rng(seed: number) {
  return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
}

/** Serie diaria de n días con forma variada (u[k] = unidades de hace k días). */
export function serie(tipo: string, seed: number, n = 120): number[] {
  const r = rng(seed), u: number[] = [];
  for (let k = 0; k < n; k++) {
    let x = 0;
    if (tipo === "regular") x = Math.round(5 + r() * 10);
    else if (tipo === "picos") x = Math.round(r() * 4) + (k % 7 === 3 && k < 30 ? 120 : 0) + (k === 1 ? 300 : 0);
    else if (tipo === "esporadico") x = r() < 0.15 ? Math.round(r() * 40) : 0;
    else if (tipo === "nuevo") x = k < 9 ? Math.round(3 + r() * 6) : 0;
    else if (tipo === "sube") x = Math.round((k < 14 ? 30 : 8) + r() * 4);
    u.push(x);
  }
  return u;
}

/** Motor y configuración (planEngine.ts + planMotor.ts + planDatos.ts). */
export const NOMBRES_MOTOR = [
  "_PLAN_ENG_Z", "_planEngDia", "_planEngDifDias", "_planEngCeil", "_planEngMediana", "_planEngPercentil", "_planEngMAD",
  "_planEngCoincide", "_planEngMasEspecifico", "_planEngN", "_planEngValido", "_planEngFactor", "_planEngTasaBase",
  "_planEngNumDef", "_PLAN_ENG_BLOQ", "_planEngSku", "_planEngAperturasDetalle", "_planEngine",
  "_planCfgDef", "_PLAN_CFG_RANGOS", "_PLAN_CFG_OPC", "_PLAN_RE_CORREO", "_planCorreosNorm", "_PLAN_SERVICIOS",
  "_PLAN_TIPOS_DEM", "_planCfgNum", "_planCfgNormalizar", "_planCfgClon",
  "_KPI_AB_DEF", "_KPI_AB_CAMPOS", "_kpiAbCfgNorm", "_impTxt", "_impFechaOk", "_zohoOcNorm",
];
/** Importaciones y Café (plan 3e) no los usa el motor local: su normalización se deja pasar tal cual. */
export const STUBS_MOTOR = `
function _impCfgDef(){return null;} function _cafeCfgDef(){return null;}
function _impCfgNorm(x){return x==null?null:x;} function _cafeCfgNorm(x){return x==null?null:x;}
`;
