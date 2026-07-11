export type NoticeTone = 'success' | 'error' | 'info';

export interface Product {
  id: string;
  name: string;
  description?: string;
  sku: string;
  mxikCode?: string | null;
  packageCode?: string | null;
  vatRate?: number | null;
  vatExempt?: boolean;
  markType?: string | null;
  isMarked?: boolean;
  unit?: string | null;
  isByWeight?: boolean;
  isWeightedPiece?: boolean;
  pluCode?: string | null;
  pricePerKg?: number | null;
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

export interface ProductBarcode {
  id: string;
  barcode: string;
  type: string;
  isDefault: boolean;
  unitQty: number | string | null;
  variantId?: string | null;
}

export interface FormData {
  name: string;
  sku: string;
  mxikCode: string;
  packageCode: string;
  // Select-driven, not a raw Product field: encodes the (vatRate,
  // vatExempt) pair as one of 'DEFAULT' | '12' | '0' | 'EXEMPT' | 'CUSTOM'
  // (see useProductForm.ts's vatOptionFromProduct/vatOptionToPayload).
  vatOption: string;
  // '' = not a marked good (isMarked derives from this being non-empty).
  markType: string;
  description: string;
  price: string;
  costPrice: string;
  stockQty: string;
  lowStockAlert: string;
  unit: string;
  // Weighted-goods fields — isWeightedPiece/pluCode/pricePerKg are only
  // meaningful (and only shown in the UI) when isByWeight is true; the
  // payload builder in useProductForm.ts clears them server-side when
  // isByWeight is false, so stale hidden-field state can't resurface.
  isByWeight: boolean;
  isWeightedPiece: boolean;
  pluCode: string;
  pricePerKg: string;
  categoryId: string;
  isActive: boolean;
}

export const emptyForm: FormData = {
  name: '',
  sku: '',
  mxikCode: '',
  packageCode: '',
  vatOption: 'DEFAULT',
  markType: '',
  description: '',
  price: '',
  costPrice: '',
  stockQty: '0',
  lowStockAlert: '5',
  unit: 'шт',
  isByWeight: false,
  isWeightedPiece: false,
  pluCode: '',
  pricePerKg: '',
  categoryId: '',
  isActive: true,
};
