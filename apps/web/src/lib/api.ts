/** En producción (Vercel) usa /api para que el rewrite envíe la petición a Railway (NEXT_PUBLIC_API_URL). */
function getApiUrl(): string {
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010/api';
  }
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010/api';
  }
  return `${window.location.origin}/api`;
}

function getApiStorageSuffix(): string {
  const apiUrl = getApiUrl();
  return apiUrl.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase();
}

function scopedStorageKey(base: string): string {
  if (typeof window === 'undefined') return base;
  return `${base}__${getApiStorageSuffix()}`;
}

/** Claves por app: cada link tiene su propia sesión para poder tener varias abiertas a la vez */
function getStationFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('station');
}

export function getTokenKey(): string {
  if (typeof window === 'undefined') return 'elio_token';
  const p = window.location.pathname;
  const station = getStationFromUrl();
  if (p.startsWith('/cajero')) return scopedStorageKey('elio_token_cajero');
  if (p.startsWith('/mozo')) return scopedStorageKey('elio_token_mozo');
  if (p.startsWith('/deposito')) return scopedStorageKey('elio_token_deposito');
  if (p.startsWith('/pos')) {
    if (station === 'cajero') return scopedStorageKey('elio_token_cajero');
    if (station === 'mozo') return scopedStorageKey('elio_token_mozo');
    if (station === 'deposito') return scopedStorageKey('elio_token_deposito');
    return scopedStorageKey('elio_token_pos');
  }
  if (p.startsWith('/kitchen')) return scopedStorageKey('elio_token_kitchen');
  if (p.startsWith('/cafeteria')) return scopedStorageKey('elio_token_cafeteria');
  return scopedStorageKey('elio_token');
}

export function getUserKey(): string {
  if (typeof window === 'undefined') return 'elio_user';
  const p = window.location.pathname;
  const station = getStationFromUrl();
  if (p.startsWith('/cajero')) return scopedStorageKey('elio_user_cajero');
  if (p.startsWith('/mozo')) return scopedStorageKey('elio_user_mozo');
  if (p.startsWith('/deposito')) return scopedStorageKey('elio_user_deposito');
  if (p.startsWith('/pos')) {
    if (station === 'cajero') return scopedStorageKey('elio_user_cajero');
    if (station === 'mozo') return scopedStorageKey('elio_user_mozo');
    if (station === 'deposito') return scopedStorageKey('elio_user_deposito');
    return scopedStorageKey('elio_user_pos');
  }
  if (p.startsWith('/kitchen')) return scopedStorageKey('elio_user_kitchen');
  if (p.startsWith('/cafeteria')) return scopedStorageKey('elio_user_cafeteria');
  return scopedStorageKey('elio_user');
}

/** Para que los links del POS mantengan la sesión por pestaña (cajero/mozo) */
export function posStationSuffix(): string {
  const s = getStationFromUrl();
  return s ? `?station=${s}` : '';
}

/** Clave de localStorage para la ubicación según la estación (cajero/mozo/pos) */
export function getLocationKey(): string {
  if (typeof window === 'undefined') return 'elio_pos_location';
  const p = window.location.pathname;
  const station = getStationFromUrl();
  if (p.startsWith('/cajero')) return scopedStorageKey('elio_cajero_location');
  if (p.startsWith('/mozo')) return scopedStorageKey('elio_mozo_location');
  if (p.startsWith('/deposito')) return scopedStorageKey('elio_deposito_location');
  if (p.startsWith('/pos')) {
    if (station === 'cajero') return scopedStorageKey('elio_cajero_location');
    if (station === 'mozo') return scopedStorageKey('elio_mozo_location');
    if (station === 'deposito') return scopedStorageKey('elio_deposito_location');
  }
  return scopedStorageKey('elio_pos_location');
}

class ApiClient {
  setToken(token: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(getTokenKey(), token);
    }
  }

  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    const key = getTokenKey();
    let token = localStorage.getItem(key);
    // Si estás en el dashboard y no hay token de panel, usar el del POS (por si iniciaste sesión como Admin en POS)
    if (!token && key === scopedStorageKey('elio_token')) {
      token = localStorage.getItem(scopedStorageKey('elio_token_pos'));
    }
    return token;
  }

  clearToken() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(getTokenKey());
      localStorage.removeItem(getUserKey());
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
    const headers: HeadersInit = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };
    if (!(options.body instanceof FormData)) {
      (headers as Record<string, string>)['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${getApiUrl()}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      this.clearToken();
      if (typeof window !== 'undefined') {
        const path = window.location.pathname;
        const dest = path.startsWith('/cajero')
          ? '/cajero'
          : path.startsWith('/mozo')
            ? '/mozo'
            : path.startsWith('/pos')
              ? '/pos'
              : path.startsWith('/kitchen')
                ? '/kitchen'
                : path.startsWith('/cafeteria')
                  ? '/cafeteria'
                  : '/login';
        window.location.href = dest;
      }
      throw new Error('No autorizado');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Error del servidor' }));
      // Si 403 en dashboard, limpiar token del panel para que la próxima petición use el del POS (por si es Admin)
      if (response.status === 403 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/pos')) {
        localStorage.removeItem(scopedStorageKey('elio_token'));
        localStorage.removeItem(scopedStorageKey('elio_user'));
      }
      const message = response.status === 403
        ? (error.message || 'No tienes permiso. Inicia sesión en el panel con un usuario Admin (/login).')
        : (error.message || `Error ${response.status}`);
      throw new Error(message);
    }

    // Handle empty responses (204, etc.)
    const text = await response.text();
    return text ? JSON.parse(text) : ({} as T);
  }

  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    let url = endpoint;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.append(key, String(value));
        }
      });
      const qs = searchParams.toString();
      if (qs) url += `?${qs}`;
    }
    return this.request<T>(url, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: any, init?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data instanceof FormData ? data : data ? JSON.stringify(data) : undefined,
      ...init,
    });
  }

  async patch<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
