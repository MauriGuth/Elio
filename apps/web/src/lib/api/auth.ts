import { api, getUserKey } from '../api';

const getApiUrl = () =>
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010/api'
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010/api';

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
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const { response, body } = await loginRequest(data);

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
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
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
                      localStorage.setItem(
                        getUserKey(),
                        JSON.stringify(loginBody2.user),
                      );
                    }
                    resolve(loginBody2);
                  } else {
                    const err2 = body2 as { message?: string };
                    reject(new Error(err2?.message ?? 'Error al verificar ubicación.'));
                  }
                })
                .catch(reject);
            },
            () => {
              reject(
                new Error(
                  errBody?.message ??
                    'Debe permitir el acceso a la ubicación para ingresar.',
                ),
              );
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
          );
        });
      }
      throw new Error(
        errBody?.message ??
          'Debe permitir el acceso a la ubicación para ingresar desde este rol.',
      );
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
