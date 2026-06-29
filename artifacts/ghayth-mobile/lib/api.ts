/**
 * تعريفات النوع المشتركة للـ API
 * apiFetch موجودة في hooks/useApi.ts
 */

export interface UserRole {
  id?: number;
  roleKey: string;
  label?: string;
  level?: number;
  modules?: string[];
  is_primary?: boolean;
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
