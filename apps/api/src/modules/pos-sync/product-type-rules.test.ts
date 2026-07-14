import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: { productType: { findMany: vi.fn() } },
}));

vi.mock('../../lib/prisma.js', () => ({ default: mocks.prisma }));

import { fetchProductTypesById, mergeProductTypeRules, deriveProductTypeFields } from './product-type-rules.js';

// docs/PRODUCT_TYPES.md §4/§6 — shared logic extracted from
// admin-routes.ts's CatalogSnapshot builder so both it and
// routes.ts's product-search endpoint use one implementation.

describe('fetchProductTypesById', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('builds a Map keyed by id from productType.findMany', async () => {
    mocks.prisma.productType.findMany.mockResolvedValue([
      { id: 'pt-1', rules: [], parentTypeId: null },
      { id: 'pt-2', rules: [], parentTypeId: 'pt-1' },
    ]);
    const typesById = await fetchProductTypesById();
    expect(typesById.get('pt-1')).toEqual({ id: 'pt-1', rules: [], parentTypeId: null });
    expect(typesById.get('pt-2')).toEqual({ id: 'pt-2', rules: [], parentTypeId: 'pt-1' });
    expect(typesById.size).toBe(2);
  });
});

describe('mergeProductTypeRules', () => {
  it('returns [] for a null/undefined productTypeId', () => {
    expect(mergeProductTypeRules(null, new Map())).toEqual([]);
    expect(mergeProductTypeRules(undefined, new Map())).toEqual([]);
  });

  it('returns the type\'s own rules unchanged when it has no parent', () => {
    const typesById = new Map([
      ['alcohol', { id: 'alcohol', rules: [{ ruleId: 'AGE_CONFIRMATION', severity: 'BLOCK', channels: ['POS'] }], parentTypeId: null }],
    ]);
    expect(mergeProductTypeRules('alcohol', typesById)).toEqual([
      { ruleId: 'AGE_CONFIRMATION', severity: 'BLOCK', channels: ['POS'] },
    ]);
  });

  it('inherits a parent\'s rules and adds the child\'s own on top (BEER example, §7)', () => {
    const typesById = new Map([
      ['alcohol', { id: 'alcohol', rules: [
        { ruleId: 'AGE_CONFIRMATION', severity: 'BLOCK', channels: ['POS', 'TELEGRAM'] },
        { ruleId: 'NO_CASH_PAYMENT', severity: 'BLOCK', channels: ['POS'] },
      ], parentTypeId: null }],
      ['beer', { id: 'beer', rules: [], parentTypeId: 'alcohol' }],
    ]);
    expect(mergeProductTypeRules('beer', typesById)).toEqual([
      { ruleId: 'AGE_CONFIRMATION', severity: 'BLOCK', channels: ['POS', 'TELEGRAM'] },
      { ruleId: 'NO_CASH_PAYMENT', severity: 'BLOCK', channels: ['POS'] },
    ]);
  });

  it('never lets a child loosen a parent\'s BLOCK to WARN for the same ruleId', () => {
    const typesById = new Map([
      ['parent', { id: 'parent', rules: [{ ruleId: 'X', severity: 'BLOCK', channels: ['POS'] }], parentTypeId: null }],
      ['child', { id: 'child', rules: [{ ruleId: 'X', severity: 'WARN', channels: ['POS'] }], parentTypeId: 'parent' }],
    ]);
    expect(mergeProductTypeRules('child', typesById)).toEqual([{ ruleId: 'X', severity: 'BLOCK', channels: ['POS'] }]);
  });

  it('is cycle-safe against a malformed parentTypeId loop', () => {
    const typesById = new Map([
      ['a', { id: 'a', rules: [{ ruleId: 'A', severity: 'WARN', channels: ['POS'] }], parentTypeId: 'b' }],
      ['b', { id: 'b', rules: [{ ruleId: 'B', severity: 'WARN', channels: ['POS'] }], parentTypeId: 'a' }],
    ]);
    const result = mergeProductTypeRules('a', typesById);
    expect(result.map((r: any) => r.ruleId).sort()).toEqual(['A', 'B']);
  });
});

describe('deriveProductTypeFields', () => {
  it('falls back to PIECE/[] when the product has no assigned type', () => {
    const fields = deriveProductTypeFields(
      { productTypeId: null, isByWeight: false, isWeightedPiece: false },
      null,
      new Map()
    );
    expect(fields).toEqual({ productTypeCode: null, productTypeRules: [], weightMode: 'PIECE', barcodePrefixes: [] });
  });

  it('derives weightMode from isByWeight/isWeightedPiece when unassigned', () => {
    expect(deriveProductTypeFields({ productTypeId: null, isByWeight: true, isWeightedPiece: false }, null, new Map()).weightMode).toBe('WEIGHT');
    // isByWeight is checked before isWeightedPiece (short-circuits to
    // 'WEIGHT' regardless) — this is the original, already-shipped
    // admin-routes.ts precedence, not something this extraction changed.
    // isWeightedPiece only reaches 'PIECE_WEIGHT' when isByWeight itself
    // is false, which in practice never happens for a genuinely
    // weighted-piece product (isWeightedPiece is only meaningful when
    // isByWeight is true — schema comment on Product.isWeightedPiece).
    expect(deriveProductTypeFields({ productTypeId: null, isByWeight: false, isWeightedPiece: true }, null, new Map()).weightMode).toBe('PIECE_WEIGHT');
  });

  it('sources code/weightMode/barcodePrefixes from the assigned ProductType when present', () => {
    const typesById = new Map([['pt-1', { id: 'pt-1', rules: [], parentTypeId: null }]]);
    const fields = deriveProductTypeFields(
      { productTypeId: 'pt-1', isByWeight: false, isWeightedPiece: false },
      { code: 'WEIGHT', weightMode: 'WEIGHT', barcodePrefixes: ['22'] },
      typesById
    );
    expect(fields).toEqual({ productTypeCode: 'WEIGHT', productTypeRules: [], weightMode: 'WEIGHT', barcodePrefixes: ['22'] });
  });
});
