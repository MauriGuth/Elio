import { api } from '../api';

export const productionApi = {
  getAll: (params?: { locationId?: string; status?: string; recipeId?: string; page?: number; limit?: number }) =>
    api.get<{ data: any[]; total: number }>('/production', params),

  getById: (id: string) => api.get<any>(`/production/${id}`),

  getStats: (locationId?: string) => api.get<any>('/production/stats', locationId ? { locationId } : undefined),

  getSuggestionsFromStock: (
    locationId: string,
    params?: { stockBand?: 'critical' | 'medium' | 'all' },
  ) =>
    api.get<{ data: any[] }>('/production/suggestions-from-stock', {
      locationId,
      ...(params?.stockBand && params.stockBand !== 'all'
        ? { stockBand: params.stockBand }
        : {}),
    }),

  create: (data: any) => api.post<any>('/production', data),

  start: (id: string) => api.post<any>(`/production/${id}/start`),

  complete: (id: string, data: any) => api.post<any>(`/production/${id}/complete`, data),

  cancel: (id: string) => api.post<any>(`/production/${id}/cancel`),

  getBatchByCode: (code: string) =>
    api.get<any>(`/production/batches/code/${encodeURIComponent(code)}`),
};
