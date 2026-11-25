import { useState } from 'react';
import type { FormEvent } from 'react';
import { BotonPrimario, Campo, MensajeDeError, TarjetaFormulario } from './formulario.tsx';
import { useSalir } from './useSalir.ts';
import { LARGO_PASSWORD } from './useSesion.ts';

// Qué hay que corregir antes de enviar, o null si la contraseña nueva está bien.
// Son los mismos límites que aplica el servidor; aquí solo se avisa antes de enviar.
function problemaConLaNueva(actual: string, nueva: string, repetida: string): string | null {
  if (nueva.length < LARGO_PASSWORD.min || nueva.length > LARGO_PASSWORD.max) {
    return `La contraseña nueva debe tener entre ${LARGO_PASSWORD.min} y ${LARGO_PASSWORD.max} caracteres`;
  }
  if (nueva === actual) return 'La contraseña nueva debe ser distinta de la actual';
  if (nueva !== repetida) return 'Las contraseñas nuevas no coinciden';
  return null;
}

// Pantalla obligatoria mientras la cuenta use su contraseña temporal.
export default function CambiarPassword({
  nombre,
  alEnviar,
  cerrarSesion,
}: {
  nombre: string;
  alEnviar: (passwordActual: string, passwordNueva: string) => Promise<string | null>;
  cerrarSesion: () => Promise<string | null>;
}) {
  const salida = useSalir(cerrarSesion);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const problema = problemaConLaNueva(actual, nueva, repetida);
    if (problema) {
      setError(problema);
      return;
    }

    setError(null);
    setEnviando(true);
    const resultado = await alEnviar(actual, nueva);
    // Si salió bien, esta pantalla desaparece, así que solo se actualiza el estado al fallar.
    if (resultado !== null) {
      setError(resultado);
      setEnviando(false);
    }
  }

  return (
    <TarjetaFormulario
      titulo="Cambia tu contraseña"
      descripcion={`Hola, ${nombre}. Tu contraseña es temporal: elige una nueva para continuar.`}
      alEnviar={enviar}
    >
      <Campo
        etiqueta="Contraseña actual"
        tipo="password"
        valor={actual}
        alCambiar={setActual}
        autoComplete="current-password"
      />
      <Campo
        etiqueta="Contraseña nueva"
        tipo="password"
        valor={nueva}
        alCambiar={setNueva}
        autoComplete="new-password"
        maxLength={LARGO_PASSWORD.max}
      />
      <Campo
        etiqueta="Repite la contraseña nueva"
        tipo="password"
        valor={repetida}
        alCambiar={setRepetida}
        autoComplete="new-password"
        maxLength={LARGO_PASSWORD.max}
      />
      <MensajeDeError mensaje={error} />
      <MensajeDeError mensaje={salida.error} />
      <div className="flex flex-wrap items-center gap-3">
        <BotonPrimario enviando={enviando} texto="Guardar contraseña" textoEnviando="Guardando…" />
        <button
          type="button"
          onClick={() => void salida.salir()}
          disabled={salida.saliendo}
          className="rounded-lg px-3 py-2.5 text-sm font-semibold text-tema-700 hover:underline focus:ring-4 focus:ring-tema-200 focus:outline-none disabled:cursor-wait disabled:opacity-60"
        >
          {salida.saliendo ? 'Cerrando…' : 'Cerrar sesión'}
        </button>
      </div>
    </TarjetaFormulario>
  );
}
