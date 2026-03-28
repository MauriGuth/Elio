import { api } from '../api';

export const stockApi = {
  getLevels: (params?: { locationId?: string; productId?: string; status?: string }) =>
    api.get<any[]>('/stock', params),

  getMovements: (params?: { productId?: string; locationId?: string; type?: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number }) =>
    api.get<{ data: any[]; total: number }>('/stock/movements', params),

  getSummary: (locationId?: string) =>
    api.get<any>('/stock/summary', locationId ? { locationId } : undefined),

  getLogisticsSummary: (locationId?: string, purchaseOnly?: boolean) =>
    api.get<Array<{
      id: string;
      productId: string;
      product: {
        id: string;
        name: string;
        sku: string | null;
        unit: string;
        avgCost: number;
        category?: { name: string; slug?: string } | null;
      };
      locationId: string;
      location: { id: string; name: string; type: string };
      quantity: number;
      minQuantity: number;
      maxQuantity: number | null;
      status: 'critical' | 'medium' | 'normal';
      suggestedOrderQty: number;
      soldLast7Days: number;
      soldLast30Days: number;
      suggestedOrderQtyByDemand: number;
    }>>(
      '/stock/logistics-summary',
      {
        ...(locationId ? { locationId } : {}),
        ...(purchaseOnly ? { purchaseOnly: 'true' } : {}),
      },
    ),

  adjust: (data: { productId: string; locationId: string; quantity: number; reason: string; notes?: string }) =>
    api.post<any>('/stock/adjust', data),

  createMovement: (data: any) => api.post<any>('/stock/movements', data),

  updateLevel: (id: string, data: { minQuantity?: number; maxQuantity?: number }) =>
    api.patch<any>(`/stock/levels/${id}`, data),
};
