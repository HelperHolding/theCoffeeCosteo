'use client';
import { cliente } from '@/lib/supabase/cliente';
import { confirmarArchivo } from '@/app/(crm)/crm/acciones';
import { prepararDocumento } from '@/app/(crm)/crm/acciones-pipeline';
import { validarArchivo } from '@/lib/crm/validacion';
import type { TipoCard } from '@/lib/crm/tipos';

/**
 * Sube un documento al expediente: registra la fila (la base genera la ruta aleatoria y numera la versión),
 * sube el objeto al bucket privado con la sesión del usuario y confirma. Si la subida falla, la fila se
 * retira con motivo «La subida no terminó». Devuelve el id del archivo o el error.
 */
export async function subirDocumento(
  tipo: TipoCard,
  card: string,
  file: File,
  tipoDocumento: string,
  reemplazaA?: string | null,
): Promise<{ id: string } | { error: string }> {
  try {
    validarArchivo(file.name, file.type, file.size);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const p = await prepararDocumento(
    tipo,
    card,
    { nombre: file.name, mime: file.type, tamano: file.size },
    tipoDocumento,
    reemplazaA,
  );
  if (p.error !== undefined) return { error: p.error };
  const r = await cliente().storage.from('crm-archivos').upload(p.ruta, file, { contentType: file.type });
  await confirmarArchivo('', p.id, !r.error);
  if (r.error) return { error: 'No se pudo subir el archivo. Intenta de nuevo.' };
  return { id: p.id };
}
