import type { ErrorRequestHandler } from 'express';

// Todo lo que tiene que ver con errores vive aquí: el texto de un error cualquiera, el error
// de la base de datos y el manejador final de Express.

export const NO_DISPONIBLE = { error: 'Servicio no disponible' };

// El texto de un error, sea o no un Error de JavaScript (se puede lanzar cualquier cosa).
export function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Un fallo al hablar con PostgreSQL: la base cayó, se agotó la espera, la consulta falló...
// `bd.ts` convierte en este error todo lo que lance la base, y así el manejador final sabe
// que debe responder 503. Conserva el `code` y la `constraint` del error original, porque el
// código que espera un fallo concreto (por ejemplo "correo repetido", 23505) los necesita.
export class ErrorDeBd extends Error {
  readonly code?: string;
  readonly constraint?: string;

  constructor(causa: unknown) {
    super(mensajeDe(causa), { cause: causa });
    this.name = 'ErrorDeBd';
    const origen = typeof causa === 'object' && causa !== null ? causa : {};
    const { code, constraint } = origen as { code?: unknown; constraint?: unknown };
    if (typeof code === 'string') this.code = code;
    if (typeof constraint === 'string') this.constraint = constraint;
  }
}

// El último middleware de la aplicación. Express 5 le entrega los errores de cualquier ruta,
// también los de las funciones async, y los convierte en respuestas JSON en lugar de la
// página HTML con la traza que Express entrega por defecto:
// - la base de datos no responde → 503;
// - el cuerpo de la petición no sirve (JSON roto, demasiado grande...) → 400, 413 o 415;
// - cualquier otro error es un fallo nuestro → 500 sin detalles para quien llama.
export const manejarErrores: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof ErrorDeBd) {
    console.error('No se pudo completar la operación con la base de datos:', error.message);
    res.status(503).json(NO_DISPONIBLE);
    return;
  }
  const estado = (error as { status?: number }).status;
  if (estado === 413) {
    res.status(413).json({ error: 'Datos demasiado grandes' });
  } else if (estado === 415) {
    res.status(415).json({ error: 'Formato de datos no soportado' });
  } else if (estado === 400) {
    res.status(400).json({ error: 'Datos inválidos' });
  } else {
    console.error('Error no controlado:', error);
    res.status(500).json({ error: 'Error interno' });
  }
};
