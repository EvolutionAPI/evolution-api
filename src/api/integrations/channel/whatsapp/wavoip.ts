import axios from 'axios';
import { useVoiceCallsBaileys } from 'voice-calls-baileys';

// Define el tipo de respuesta esperada para mayor seguridad
interface ApiResponse {
  type?: string;
  data?: any;
  message?: string;
  result?: {
    code?: string;
  };
}

// Hace una solicitud a la API
async function makeRequest(token: string): Promise<boolean> {
  try {
    const url = 'https://api.wavoip.com/devices/evolution';
    const payload = {
      name: '',
      token: token,
    };

    console.log(`Enviando solicitud a la API con el token: ${token}`);
    const response = await axios.post<ApiResponse>(url, payload);
    const data = response.data;

    if (data?.type === 'success') {
      console.log('¡Solicitud exitosa!');
      return true;
    } else if (data?.result?.code === 'ER_DUP_ENTRY') {
      console.warn('La sesión ya existe, omitiendo creación...');
      return true; // Tratar como éxito ya que la sesión ya existe.
    } else {
      console.log('Respuesta no válida. Intentando de nuevo...', data);
      return false;
    }
  } catch (error: any) {
    const statusCode = error?.response?.status;
    const errorMessage = error?.response?.data?.message || error?.message || error;

    if (statusCode === 500) {
      console.error('Error 500: ', error?.response?.data || 'Error en el servidor.');
    } else {
      console.error(`Error ${statusCode}:`, errorMessage);
    }
    return false;
  }
}

// Reintenta la solicitud hasta que tenga éxito o supere el límite de reintentos
async function retryRequest(token: string, maxRetries = 5): Promise<void> {
  let attempts = 0;

  while (attempts < maxRetries) {
    console.log(`Intento ${attempts + 1} de ${maxRetries}`);
    const success = await makeRequest(token);

    if (success) {
      console.log('Conexión establecida exitosamente.');
      return;
    }

    attempts++;
    console.log('Esperando 1 segundo antes de volver a intentar...');
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Espera 1 segundo antes de volver a intentar
  }

  console.error('Límite de reintentos alcanzado. La solicitud ha fallado.');
}

// Inicia la conexión con el cliente y la instancia
export const startConnection = async (client: any, instance: { token: string }): Promise<void> => {
  const token = instance.token;

  if (!token) {
    console.error('Token no recibido. No se puede iniciar la conexión.');
    return;
  }

  console.log('Iniciando la conexión con el token:', token);
  await retryRequest(token);

  console.log('Usando Voice Calls con Baileys...');
  useVoiceCallsBaileys(token, client, 'open', true);
};
