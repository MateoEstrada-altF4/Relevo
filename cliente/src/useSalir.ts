import { useState } from 'react';

// Lo que necesita un botón de "Cerrar sesión": avisar si no se pudo cerrar. Si salió bien, la
// pantalla cambia sola (la sesión pasa a "sin sesión"), así que solo se actualiza el estado
// al fallar. `cerrarSesion` devuelve null o el mensaje de error.
export function useSalir(cerrarSesion: () => Promise<string | null>) {
  const [error, setError] = useState<string | null>(null);
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    setError(null);
    setSaliendo(true);
    const resultado = await cerrarSesion();
    if (resultado !== null) {
      setError(resultado);
      setSaliendo(false);
    }
  }

  return { error, saliendo, salir };
}
