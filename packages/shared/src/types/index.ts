export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface JwtPayload {
  userId: string;
  tenantId: string;
  role: string;
}

export interface TelegramInitData {
  userId: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
  authDate: number;
  hash: string;
}
