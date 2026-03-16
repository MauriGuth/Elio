import { api } from '../api';

export const aiEventsApi = {
  getAll: (params?: { type?: string; severity?: string; status?: string; page?: number; limit?: number }) =>
    api.get<{ data: any[]; total: number }>('/ai-events', params),

  getById: (id: string) => api.get<any>(`/ai-events/${id}`),

  getActive: () => api.get<any[]>('/ai-events/active'),

  takeAction: (id: string, data: { actionTaken: string }) => api.post<any>(`/ai-events/${id}/action`, data),

  dismiss: (id: string) => api.post<any>(`/ai-events/${id}/dismiss`),

  generatePredictions: () => api.post<any>('/ai-events/predictions'),

  analyzeReport: (params?: {
    dateFrom?: string;
    dateTo?: string;
    locationId?: string;
    reportType?: string;
  }) => api.post<any>('/ai-events/analyze-report', params || {}),

  analyzeAlerts: () => api.post<any>('/ai-events/analyze-alerts'),

  transcribeAudio: (audio: string, language?: string, fileExt?: string, prompt?: string) =>
    api.post<{ success: boolean; transcript: string }>('/ai-events/transcribe-audio', {
      audio,
      language: language ?? 'es',
      fileExt: fileExt ?? 'webm',
      ...(prompt ? { prompt } : {}),
    }),
};
