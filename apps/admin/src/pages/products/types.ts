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
  parentId?: string | null;
  sortOrder?: number;
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
  // unit alone now drives weighted-goods behavior — 'кг'/'г' means
  // isByWeight=true at save time (useProductForm.ts's saveProduct);
  // there is no separate isByWeight form field/checkbox anymore.
  unit: string;
  // Only meaningful (and only shown in the UI) when unit is 'кг'/'г';
  // the payload builder clears it server-side otherwise, so stale
  // hidden-field state can't resurface.
  isWeightedPiece: boolean;
  pluCode: string;
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
  unit: '',
  isWeightedPiece: false,
  pluCode: '',
  categoryId: '',
  isActive: true,
};
