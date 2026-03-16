type Listener = (count: number) => void;

let count = 0;
const listeners = new Set<Listener>();

export const cartStore = {
  get: () => count,
  set: (n: number) => {
    count = n;
    listeners.forEach((l) => l(n));
  },
  inc: () => cartStore.set(count + 1),
  sub: (fn: Listener): (() => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};
