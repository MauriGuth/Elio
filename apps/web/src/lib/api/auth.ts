import { api, getApiUrl, getUserKey } from '../api';

/** Clave y validez de coordenadas GPS guardadas al permitir ubicación en /pos */
const POS_GPS_STORAGE_KEY = 'elio_pos_gps_coords';
const POS_GPS_MAX_AGE_MS = 2 * 60 * 1000; // 2 minutos

export function getStoredPosCoords(): { lat: number; lng: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(POS_GPS_STORAGE_KEY);
    if (!raw) return null;
    const { lat, lng, timestamp } = JSON.parse(raw) as { lat: number; lng: number; timestamp: number };
    if (typeof lat !== 'number' || typeof lng !== 'number' || !timestamp) return null;
    if (Date.now() - timestamp > POS_GPS_MAX_AGE_MS) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

export function setStoredPosCoords(lat: number, lng: number): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(POS_GPS_STORAGE_KEY, JSON.stringify({ lat, lng, timestamp: Date.now() }));
  } catch {}
}

export interface LoginRequest {
  email: string;
  password: string;
  latitude?: number;
  longitude?: number;
}

export interface LoginResponse {
  access_token: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    location: { id: string; name: string; type: string } | null;
    locations?: { id: string; name: string; type: string }[];
    avatarUrl?: string | null;
  };
}

async function loginRequest(payload: LoginRequest): Promise<{ response: Response; body: LoginResponse | { code?: string; message?: string } }> {
  const url = `${getApiUrl()}/auth/login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { response: res, body: body as LoginResponse | { code?: string; message?: string } };
}

export const authApi = {
  /**
   * Iniciar sesión enviando ubicación GPS. Debe llamarse desde un clic del usuario
   * (ej. botón "Usar mi ubicación") para que el navegador permita el acceso.
   */
  loginWithLocation: async (data: { email: string; password: string }): Promise<LoginResponse> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      throw new Error('Tu navegador no soporta ubicación. Probá desde otro dispositivo.');
    }
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          loginRequest({
            ...data,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          })
            .then(({ response: res2, body: body2 }) => {
              if (res2.ok) {
                const loginBody2 = body2 as LoginResponse;
                api.setToken(loginBody2.access_token);
                if (typeof window !== 'undefined') {
                  localStorage.setItem(getUserKey(), JSON.stringify(loginBody2.user));
                }
                resolve(loginBody2);
              } else {
                const err2 = body2 as { message?: string };
                reject(new Error(err2?.message ?? 'Error al verificar ubicación.'));
              }
            })
            .catch(reject);
        },
        (err: GeolocationPositionError) => {
          if (err.code === 1) {
            reject(new Error('Tenés que permitir la ubicación para ingresar.'));
          } else if (err.code === 3) {
            reject(new Error('Se acabó el tiempo. Intentá de nuevo y permití la ubicación.'));
          } else {
            reject(new Error('No se pudo obtener la ubicación. Revisá que esté permitida.'));
          }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });
  },

  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const payload = { ...data };
    const stored = getStoredPosCoords();
    if (stored && typeof payload.latitude !== 'number' && typeof payload.longitude !== 'number') {
      payload.latitude = stored.lat;
      payload.longitude = stored.lng;
    }
    const { response, body } = await loginRequest(payload);

    if (response.ok) {
      const loginBody = body as LoginResponse;
      api.setToken(loginBody.access_token);
      if (typeof window !== 'undefined') {
        localStorage.setItem(getUserKey(), JSON.stringify(loginBody.user));
      }
      return loginBody;
    }

    const errBody = body as { code?: string; message?: string };
    if (
      response.status === 403 &&
      (errBody?.code === 'LOCATION_REQUIRED' || errBody?.code === 'LOCATION_OUTSIDE')
    ) {
      if (errBody?.code === 'LOCATION_OUTSIDE') {
        throw new Error(
          errBody?.message ?? 'Solo puede ingresar cuando esté en una de sus ubicaciones asignadas.',
        );
      }
      // No pedir ubicación aquí: los navegadores solo la permiten tras un gesto del usuario (clic).
      // La pantalla debe mostrar un botón "Usar mi ubicación" que llame a loginWithLocation().
      const locErr = new Error(
        errBody?.message ?? 'Debe permitir el acceso a la ubicación para ingresar desde este rol.',
      ) as Error & { code: string };
      locErr.code = 'LOCATION_REQUIRED';
      throw locErr;
    }

    throw new Error(
      (errBody?.message as string) ?? `Error ${response.status}`,
    );
  },

  me: () => api.get<LoginResponse['user']>('/auth/me'),

  verifyFace: async (photoFile: File): Promise<{ verified: boolean }> => {
    const form = new FormData();
    form.append('photo', photoFile);
    return api.post<{ verified: boolean }>('/auth/verify-face', form);
  },

  logout: () => {
    api.clearToken();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },

  getStoredUser: (): LoginResponse['user'] | null => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem(getUserKey());
    return stored ? JSON.parse(stored) : null;
  },

  isAuthenticated: (): boolean => {
    return !!api.getToken();
  },
};
