/**
 * تعريفات النوع المشتركة للـ API
 * apiFetch موجودة في hooks/useApi.ts
 */

export interface UserRole {
  id: number;
  name: string;
  level?: number;
  modules?: string[];
}

export interface ApiErrorBody {
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  errors?: Record<string, string>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
