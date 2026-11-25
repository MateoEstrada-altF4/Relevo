import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  BotonPrimario,
  Campo,
  MensajeDeError,
  TarjetaFormulario,
} from './components/formulario.tsx';

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
      <BotonPrimario enviando={enviando} texto="Entrar" textoEnviando="Entrando…" />
    </TarjetaFormulario>
  );
}
