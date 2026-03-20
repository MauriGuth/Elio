import { api } from '../api';

export const recipesApi = {
  getAll: (params?: {
    search?: string;
    category?: string;
    isActive?: boolean;
    /** IDs de ubicación separados por coma o array; solo recetas que se realizan en al menos una. */
    locationIds?: string[] | string;
    page?: number;
    limit?: number;
  }) => api.get<{ data: any[]; total: number }>('/recipes', params),

  getById: (id: string) => api.get<any>(`/recipes/${id}`),

  /** Receta activa del producto: grupos de variantes en ingredientes + filas para checklist POS. */
  getPosContext: (productId: string) =>
    api.get<{
      recipeId: string | null
      modifierGroupIds: string[]
      ingredients: {
        id: string
        productId: string
        name: string
        modifierGroupId: string | null
      }[]
    }>(`/recipes/pos-context/${productId}`),

  create: (data: any) => api.post<any>('/recipes', data),

  update: (id: string, data: any) => api.patch<any>(`/recipes/${id}`, data),

  delete: (id: string) => api.delete(`/recipes/${id}`),

  addIngredient: (recipeId: string, data: any) => api.post<any>(`/recipes/${recipeId}/ingredients`, data),

  updateIngredient: (id: string, data: any) => api.patch<any>(`/recipes/ingredients/${id}`, data),

  removeIngredient: (id: string) => api.delete(`/recipes/ingredients/${id}`),

  calculateCost: (id: string, qty: number) => api.get<any>(`/recipes/${id}/cost`, { qty }),

  newVersion: (id: string) => api.post<any>(`/recipes/${id}/new-version`),
};
