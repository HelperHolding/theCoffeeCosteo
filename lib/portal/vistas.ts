/**
 * Personalizaciones de vista por cuenta. Se deciden en el servidor con el user_id de la sesión autenticada,
 * nunca por rol, nombre visible, URL ni almacenamiento del navegador. No cambian permisos de edición.
 */

// Columna "Margen con comisión Rappi" en la tabla de Productos: una sola cuenta, pedida el 2026-10-20.
const MARGEN_RAPPI_EN_TABLA = new Set(['184edce3-1d2c-486c-957d-aed731ba1692']);

export const veMargenRappiEnTabla = (userId: string) => MARGEN_RAPPI_EN_TABLA.has(userId);
