import { expect, it } from 'vitest';
import { camposTienda, validar, validarArchivo } from '../../lib/crm/validacion';

it('valida solo los campos editables presentes y descarta los de sistema', () => {
  const d = validar(camposTienda, {
    nombre: '  Tienda Centro ',
    fecha_apertura: '2026-02-01',
    rappi: 'on',
    numero_tienda_jestor: '42',
    ciudad: '',
    etapa_id: 'no-se-edita-aqui',
    zoho_record_id: 'falso',
  });
  expect(d).toEqual({
    nombre: 'Tienda Centro',
    fecha_apertura: '2026-02-01',
    rappi: true,
    numero_tienda_jestor: 42,
    ciudad: null,
  });
});

it('rechaza valores fuera de contrato con mensajes claros', () => {
  expect(() => validar(camposTienda, { nombre: '' })).toThrow('obligatorio');
  expect(() => validar(camposTienda, { fecha_apertura: '01/02/2026' })).toThrow('fecha válida');
  expect(() => validar(camposTienda, { marca_cafetera: 'Otra' })).toThrow('opción no válida');
  expect(() => validar(camposTienda, { url_dictamen_local: 'javascript:alert(1)' })).toThrow('https://');
  expect(() => validar(camposTienda, { correo_tienda: 'sin-arroba' })).toThrow('correo válido');
  expect(() => validar(camposTienda, { numero_tienda_jestor: '4.5' })).toThrow('entero');
});

it('solo acepta archivos permitidos de hasta 25 MB', () => {
  expect(() => validarArchivo('plano.pdf', 'application/pdf', 1024)).not.toThrow();
  expect(() => validarArchivo('script.exe', 'application/x-msdownload', 1024)).toThrow('no permitido');
  expect(() => validarArchivo('grande.pdf', 'application/pdf', 26 * 1024 * 1024)).toThrow('25 MB');
  expect(() => validarArchivo('vacio.pdf', 'application/pdf', 0)).toThrow('25 MB');
});
