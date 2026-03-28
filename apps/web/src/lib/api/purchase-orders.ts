import { api } from '../api';

export const purchaseOrdersApi = {
  getDemandSummary: (locationId: string) =>
    api.get<any>('/purchase-orders/demand-summary', { locationId }),

  generateFromDemand: (data: { locationId: string; productIds?: string[] }) =>
    api.post<any[]>('/purchase-orders/generate-from-demand', data),

  getAll: (params?: {
    locationId?: string;
    supplierId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) => api.get<{ data: any[]; total: number; page: number; limit: number; totalPages: number }>('/purchase-orders', params),

  getById: (id: string) => api.get<any>(`/purchase-orders/${id}`),

  updateItem: (purchaseOrderId: string, itemId: string, data: { quantity: number }) =>
    api.patch<any>(`/purchase-orders/${purchaseOrderId}/items/${itemId}`, data),

  addItem: (
    purchaseOrderId: string,
    data: { productId: string; quantity: number; unitCost?: number },
  ) => api.post<any>(`/purchase-orders/${purchaseOrderId}/items`, data),

  removeItem: (purchaseOrderId: string, itemId: string) =>
    api.delete<any>(`/purchase-orders/${purchaseOrderId}/items/${itemId}`),

  create: (data: {
    locationId: string;
    supplierId: string;
    notes?: string;
    items: Array<{
      productId: string;
      quantity: number;
      unitCost: number;
      lastKnownCost?: number;
      priceStatus?: string;
      notes?: string;
    }>;
  }) => api.post<any>('/purchase-orders', data),

  place: (id: string) => api.patch<any>(`/purchase-orders/${id}/place`, {}),
  confirm: (id: string) => api.patch<any>(`/purchase-orders/${id}/confirm`, {}),
  receive: (id: string, data: { goodsReceiptId?: string } = {}) =>
    api.patch<any>(`/purchase-orders/${id}/receive`, data),
  approve: (id: string) => api.patch<any>(`/purchase-orders/${id}/approve`, {}),
};
