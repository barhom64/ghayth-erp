import type { Request } from "express";

export interface PaginationOptions {
  maxPageSize?: number;
  defaultPageSize?: number;
}

export interface PaginationResult {
  page: number;
  pageSize: number;
  offset: number;
  limitClause: string;
}

const GLOBAL_MAX_PAGE_SIZE = 100;

export function parsePagination(
  req: Request,
  opts: PaginationOptions = {}
): PaginationResult {
  const maxPageSize = Math.min(opts.maxPageSize ?? GLOBAL_MAX_PAGE_SIZE, GLOBAL_MAX_PAGE_SIZE);
  const defaultPageSize = Math.min(opts.defaultPageSize ?? 25, maxPageSize);

  const rawPage = parseInt((req.query.page as string) ?? "1", 10);
  const rawPageSize = parseInt((req.query.pageSize as string) ?? String(defaultPageSize), 10);

  const page = Math.max(1, isNaN(rawPage) ? 1 : rawPage);
  const pageSize = Math.max(1, Math.min(isNaN(rawPageSize) ? defaultPageSize : rawPageSize, maxPageSize));
  const offset = (page - 1) * pageSize;

  return {
    page,
    pageSize,
    offset,
    limitClause: `LIMIT ${pageSize} OFFSET ${offset}`,
  };
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
): { data: T[]; total: number; page: number; pageSize: number; totalPages: number } {
  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
