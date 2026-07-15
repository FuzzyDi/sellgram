import prisma from '../../lib/prisma.js';

// docs/PRODUCT_TYPES.md §4/§6 — shared between admin-routes.ts's
// CatalogSnapshot builder and routes.ts's product-search endpoint, both
// of which need to derive the same four fields
// (productTypeCode/productTypeRules/weightMode/barcodePrefixes) from a
// Product's assigned ProductType. One implementation, not two copies of
// the same parent-chain rule merge drifting apart over time.

export type ProductTypeForRules = { id: string; rules: unknown; parentTypeId: string | null };

// Global, not tenant-scoped (docs/PRODUCT_TYPES.md §2) — small (seed
// rows plus whatever tenant-custom types exist), fetched once per
// request so mergeProductTypeRules can walk a parentTypeId chain of any
// depth without a query per product.
export async function fetchProductTypesById(): Promise<Map<string, ProductTypeForRules>> {
  const allProductTypes = await prisma.productType.findMany({
    select: { id: true, rules: true, parentTypeId: true },
  });
  return new Map(allProductTypes.map((t) => [t.id, t]));
}

// docs/PRODUCT_TYPES.md §4 inheritance: child overlays parent by
// ruleId, BLOCK always wins over WARN for a shared ruleId, parent rules
// the child doesn't mention pass through unchanged. Walks root-to-leaf
// (reversed after collecting leaf-to-root) so a later, more-specific
// entry in the chain is what actually overrides an earlier,
// less-specific one below. ProductType.rules is unconstrained Json
// (docs/PRODUCT_TYPES.md §4) — cast through `any` rather than typing
// every ruleId shape.
export function mergeProductTypeRules(
  productTypeId: string | null | undefined,
  typesById: Map<string, ProductTypeForRules>
): any[] {
  if (!productTypeId) return [];
  const chain: any[][] = [];
  let current = typesById.get(productTypeId);
  const visited = new Set<string>();
  while (current) {
    chain.push(Array.isArray(current.rules) ? (current.rules as any[]) : []);
    if (!current.parentTypeId || visited.has(current.parentTypeId)) break;
    visited.add(current.parentTypeId);
    current = typesById.get(current.parentTypeId);
  }
  chain.reverse(); // root first, leaf (the product's own type) last

  const merged = new Map<string, any>();
  for (const ruleArr of chain) {
    for (const rule of ruleArr) {
      const existing = merged.get(rule.ruleId);
      // A less-specific ancestor already blocking this ruleId can't be
      // loosened to WARN by a more-specific descendant.
      merged.set(rule.ruleId, existing?.severity === 'BLOCK' ? { ...rule, severity: 'BLOCK' } : rule);
    }
  }
  return Array.from(merged.values());
}

export type ProductTypeSummary = { code: string; weightMode: string; barcodePrefixes: string[] } | null | undefined;

// Bundles the same four-field derivation admin-routes.ts's
// productsForSnapshot mapping and the product-search endpoint both need
// — one call site per product, not four separate lines duplicated in
// two files.
export function deriveProductTypeFields(
  product: { productTypeId: string | null; isByWeight: boolean; isWeightedPiece: boolean },
  productType: ProductTypeSummary,
  typesById: Map<string, ProductTypeForRules>
) {
  return {
    productTypeCode: productType?.code ?? null,
    productTypeRules: mergeProductTypeRules(product.productTypeId, typesById),
    // isWeightedPiece checked first — it's the more specific case
    // ("штучно-весовой") and, per the schema comment on
    // Product.isWeightedPiece, is only ever meaningful when isByWeight
    // is also true. Checking isByWeight first made PIECE_WEIGHT
    // unreachable: every valid isWeightedPiece=true row also has
    // isByWeight=true, so the old order short-circuited to WEIGHT before
    // isWeightedPiece was ever consulted.
    weightMode: productType?.weightMode ?? (product.isWeightedPiece ? 'PIECE_WEIGHT' : product.isByWeight ? 'WEIGHT' : 'PIECE'),
    barcodePrefixes: productType?.barcodePrefixes ?? [],
  };
}
