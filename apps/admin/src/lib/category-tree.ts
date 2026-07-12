// Shared by Categories.tsx (category list + "родительская категория"
// select) and ProductForm.tsx (product category select) — both need the
// same parent-then-children ordering and the same "which categories can't
// be picked as a parent" guard, so the tree walk lives here once instead
// of twice.

export interface CategoryTreeNode {
  id: string;
  parentId?: string | null;
  sortOrder?: number;
}

export interface WithDepth {
  depth: number;
}

// Orders categories so every parent is immediately followed by all of its
// descendants (parent, child, grandchild, ..., next sibling subtree) and
// annotates each with its nesting depth (0 = root). Categories whose
// parentId doesn't resolve to another category in the input (deleted
// parent, or a parent filtered out upstream e.g. by search) are appended
// as depth-0 roots rather than silently dropped. A `visited` guard makes
// this resilient to a bad/cyclic parentId chain reaching this code
// somehow — should never happen given create/update guards against it,
// but a rendering helper has no business infinite-looping if it does.
export function buildCategoryHierarchy<T extends CategoryTreeNode>(categories: T[]): (T & WithDepth)[] {
  const byParent = new Map<string | null, T[]>();
  for (const c of categories) {
    const key = c.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(c);
  }
  for (const list of byParent.values()) list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const result: (T & WithDepth)[] = [];
  const visited = new Set<string>();

  function walk(parentId: string | null, depth: number) {
    for (const c of byParent.get(parentId) || []) {
      if (visited.has(c.id)) continue;
      visited.add(c.id);
      result.push({ ...c, depth });
      walk(c.id, depth + 1);
    }
  }
  walk(null, 0);

  for (const c of categories) {
    if (!visited.has(c.id)) {
      visited.add(c.id);
      result.push({ ...c, depth: 0 });
    }
  }

  return result;
}

// All descendants (children, grandchildren, ...) of `rootId` — used to
// keep a category out of its own "родительская категория" options (can't
// become a child of its own descendant) alongside the category itself.
export function getDescendantIds(categories: CategoryTreeNode[], rootId: string): Set<string> {
  const byParent = new Map<string, string[]>();
  for (const c of categories) {
    if (c.parentId) {
      if (!byParent.has(c.parentId)) byParent.set(c.parentId, []);
      byParent.get(c.parentId)!.push(c.id);
    }
  }
  const result = new Set<string>();
  function walk(id: string) {
    for (const childId of byParent.get(id) || []) {
      if (!result.has(childId)) {
        result.add(childId);
        walk(childId);
      }
    }
  }
  walk(rootId);
  return result;
}
