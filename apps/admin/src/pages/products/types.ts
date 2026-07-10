export type NoticeTone = 'success' | 'error' | 'info';

export interface Product {
  id: string;
  name: string;
  description?: string;
  sku: string;
  mxikCode?: string | null;
  packageCode?: string | null;
  price: number;
  stockQty: number;
  lowStockAlert: number;
  isActive: boolean;
  category?: { id: string; name: string };
  images?: { id: string; url: string }[];
}

export interface CategoryAttribute {
  id: string;
  name: string;
  sortOrder: number;
}

export interface Category {
  id: string;
  name: string;
  attributes?: CategoryAttribute[];
}

export interface Variant {
  id: string;
  name: string;
  price: number | null;
  stockQty: number;
  isActive: boolean;
  sku?: string | null;
}

export interface PendingVariant {
  name: string;
  price: string;
  stockQty: string;
}

export interface FormData {
  name: string;
  sku: string;
  mxikCode: string;
  packageCode: string;
  description: string;
  price: string;
  costPrice: string;
  stockQty: string;
  lowStockAlert: string;
  unit: string;
  categoryId: string;
  isActive: boolean;
}

export const emptyForm: FormData = {
  name: '',
  sku: '',
  mxikCode: '',
  packageCode: '',
  description: '',
  price: '',
  costPrice: '',
  stockQty: '0',
  lowStockAlert: '5',
  unit: 'dona',
  categoryId: '',
  isActive: true,
};
