import { api } from '../api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001/api';

export const goodsReceiptsApi = {
  getAll: (params?: { locationId?: string; supplierId?: string; status?: string; method?: string; page?: number; limit?: number }) =>
    api.get<{ data: any[]; total: number }>('/goods-receipts', params),

  getById: (id: string) => api.get<any>(`/goods-receipts/${id}`),

  create: (data: any) => api.post<any>('/goods-receipts', data),

  update: (id: string, data: any) => api.patch<any>(`/goods-receipts/${id}`, data),

  addItem: (receiptId: string, data: any) => api.post<any>(`/goods-receipts/${receiptId}/items`, data),

  updateItem: (itemId: string, data: any) => api.patch<any>(`/goods-receipts/items/${itemId}`, data),

  removeItem: (itemId: string) => api.delete(`/goods-receipts/items/${itemId}`),

  confirm: (id: string) => api.post<any>(`/goods-receipts/${id}/confirm`),

  cancel: (id: string) => api.post<any>(`/goods-receipts/${id}/cancel`),

  getPriceComparison: (id: string) =>
    api.get<{ items: Array<{ goodsReceiptItemId: string; productId: string; productName?: string; previousUnitCost?: number; currentUnitCost: number; change?: 'up' | 'down' | 'same'; changePercent?: number }> }>(`/goods-receipts/${id}/price-comparison`),

  ocrScan: async (file: File) => {
    const formData = new FormData();
    formData.append('invoice', file);
    const token = typeof window !== 'undefined' ? localStorage.getItem('elio_token') : null;
    const res = await fetch(`${API_BASE_URL}/goods-receipts/ocr-scan`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Error de OCR' }));
      throw new Error(err.message || 'Error procesando la imagen');
    }
    return res.json();
  },
};
