import { useState } from 'react';
import type { FormEvent } from 'react';
import { Campo, MensajeDeError, TarjetaFormulario } from './formulario.tsx';

// Formulario de inicio de sesión. `alEnviar` devuelve null si salió bien o el mensaje de error.
export default function Login({
  alEnviar,
}: {
  alEnviar: (email: string, password: string) => Promise<string | null>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    const resultado = await alEnviar(email, password);
    // Si salió bien, esta pantalla desaparece, así que solo se actualiza el estado al fallar.
    if (resultado !== null) {
      setError(resultado);
      setEnviando(false);
    }
  }

  return (
    <TarjetaFormulario
      titulo="Iniciar sesión"
      descripcion="Entra con tu correo y tu contraseña."
      alEnviar={enviar}
    >
      <Campo
        etiqueta="Correo"
        tipo="email"
        valor={email}
        alCambiar={setEmail}
        autoComplete="username"
      />
      <Campo
        etiqueta="Contraseña"
        tipo="password"
        valor={password}
        alCambiar={setPassword}
        autoComplete="current-password"
      />
      <MensajeDeError mensaje={error} />
      <button
        type="submit"
        disabled={enviando}
        className="rounded-lg bg-tema-600 px-4 py-2.5 font-semibold text-white transition hover:bg-tema-700 focus:ring-4 focus:ring-tema-200 focus:outline-none disabled:cursor-wait disabled:opacity-60"
      >
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
    </TarjetaFormulario>
  );
}
