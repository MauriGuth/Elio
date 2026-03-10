import { api } from '../api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const productsApi = {
  getAll: (params?: { search?: string; categoryId?: string; familia?: string; locationId?: string; isActive?: boolean; isSellable?: boolean; isIngredient?: boolean; page?: number; limit?: number }) =>
    api.get<{ data: any[]; total: number; page: number; limit: number }>('/products', params),

  getById: (id: string) => api.get<any>(`/products/${id}`),

  getStock: (id: string) => api.get<any[]>(`/products/${id}/stock`),

  /** Sube la imagen pasando por la ruta del front (proxy) para evitar CORS y rutas incorrectas */
  uploadImage: async (file: File): Promise<{ url: string }> => {
    const form = new FormData();
    form.append('file', file);
    const base =
      typeof window !== 'undefined'
        ? window.location.origin
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : API_URL.replace(/\/api\/?$/, '');
    const url = `${base}/api/products/upload-image`;
    const token = api.getToken();
    const res = await fetch(url, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || `Error ${res.status}`);
    }
    return res.json();
  },

  create: (data: any) => api.post<any>('/products', data),

  update: (id: string, data: any) => api.patch<any>(`/products/${id}`, data),

  delete: (id: string) => api.delete(`/products/${id}`),
};
