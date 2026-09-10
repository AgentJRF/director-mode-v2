import { useStore } from '../store';
// re-render helper: subscribe to the store revision counter
export const useRev = () => useStore(s => s.rev);
export const grad = (a: string, b: string) => `linear-gradient(135deg,${a},${b})`;
