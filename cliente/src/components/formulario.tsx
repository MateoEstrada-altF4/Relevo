import type { FormEvent, ReactNode } from 'react';

// Piezas compartidas por los formularios (login y cambio de contraseña),
// para que se vean igual y no se repita el mismo marcado.

export function TarjetaFormulario({
  titulo,
  descripcion,
  alEnviar,
  children,
}: {
  titulo: string;
  descripcion: string;
  alEnviar: (evento: FormEvent) => void;
  children: ReactNode;
}) {
  return (
    <form
      onSubmit={alEnviar}
      className="grid w-full max-w-md gap-4 rounded-xl border border-tema-200 bg-white px-5 py-6 shadow-sm shadow-tema-500/10 sm:px-8 sm:py-8"
    >
      <div>
        <h2 className="text-xl font-bold text-tema-900">{titulo}</h2>
        <p className="mt-1 text-sm text-tema-700">{descripcion}</p>
      </div>
      {children}
    </form>
  );
}

export function Campo({
  etiqueta,
  tipo,
  valor,
  alCambiar,
  autoComplete,
  maxLength,
}: {
  etiqueta: string;
  tipo: 'email' | 'password';
  valor: string;
  alCambiar: (valor: string) => void;
  autoComplete: string;
  maxLength?: number;
}) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-tema-900">
      {etiqueta}
      <input
        type={tipo}
        value={valor}
        onChange={(evento) => alCambiar(evento.target.value)}
        autoComplete={autoComplete}
        maxLength={maxLength}
        required
        className="rounded-lg border border-tema-200 bg-white px-3 py-2 text-base font-normal text-tema-950 focus:border-tema-500 focus:ring-4 focus:ring-tema-200 focus:outline-none"
      />
    </label>
  );
}

// El botón principal de un formulario: el mismo estilo en el login y en el cambio de contraseña.
export function BotonPrimario({
  enviando,
  texto,
  textoEnviando,
}: {
  enviando: boolean;
  texto: string;
  textoEnviando: string;
}) {
  return (
    <button
      type="submit"
      disabled={enviando}
      className="rounded-lg bg-tema-600 px-4 py-2.5 font-semibold text-white transition hover:bg-tema-700 focus:ring-4 focus:ring-tema-200 focus:outline-none disabled:cursor-wait disabled:opacity-60"
    >
      {enviando ? textoEnviando : texto}
    </button>
  );
}

// Centra un formulario en el espacio que queda bajo la cabecera, sea cual sea el tamaño de la ventana.
export function Centrado({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 items-center justify-center py-8">{children}</div>;
}

// role="alert" hace que los lectores de pantalla anuncien el error al aparecer.
export function MensajeDeError({ mensaje }: { mensaje: string | null }) {
  if (mensaje === null) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
    >
      {mensaje}
    </p>
  );
}
