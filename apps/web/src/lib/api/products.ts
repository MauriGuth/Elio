import { api } from '../api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010/api';

export const productsApi = {
  getAll: (params?: { search?: string; categoryId?: string; familia?: string; isActive?: boolean; isSellable?: boolean; isIngredient?: boolean; page?: number; limit?: number; _refresh?: number }) =>
    api.get<{ data: any[]; total: number; page: number; limit: number }>('/products', params),

  /** Si pasás _refresh (ej. Date.now()) se evita caché y se ven de inmediato los cambios de ubicaciones. */
  getById: (id: string, noCache?: boolean) =>
    api.get<any>(`/products/${id}`, noCache ? { _refresh: Date.now() } : undefined),

  getStock: (id: string) => api.get<any[]>(`/products/${id}/stock`),

  /** Grupos de modificadores + opciones + líneas de stock (insumos extra por opción). */
  getModifiers: (id: string) => api.get<any[]>(`/products/${id}/modifiers`),

  createModifierGroup: (productId: string, data: Record<string, unknown>) =>
    api.post(`/products/${productId}/modifier-groups`, data),

  updateModifierGroup: (groupId: string, data: Record<string, unknown>) =>
    api.patch(`/products/modifier-groups/${groupId}`, data),

  deleteModifierGroup: (groupId: string) =>
    api.delete(`/products/modifier-groups/${groupId}`),

  createModifierOption: (groupId: string, data: Record<string, unknown>) =>
    api.post(`/products/modifier-groups/${groupId}/options`, data),

  /** Opción POS + insumos copiados desde ingredientes base de una receta (no duplica la receta). */
  createModifierOptionFromRecipe: (
    groupId: string,
    data: { recipeId: string; label?: string; priceDelta?: number; sortOrder?: number },
  ) => api.post(`/products/modifier-groups/${groupId}/options/from-recipe`, data),

  updateModifierOption: (optionId: string, data: Record<string, unknown>) =>
    api.patch(`/products/modifier-options/${optionId}`, data),

  deleteModifierOption: (optionId: string) =>
    api.delete(`/products/modifier-options/${optionId}`),

  setModifierStockLines: (
    optionId: string,
    lines: { productId: string; quantity: number }[],
  ) => api.put(`/products/modifier-options/${optionId}/stock-lines`, { lines }),

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
