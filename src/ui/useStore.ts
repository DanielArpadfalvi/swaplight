import { useEffect, useState } from 'preact/hooks';
import type { Store } from '../game/store';

export function useStore<T extends object>(store: Store<T>): T {
  const [state, setState] = useState(store.get());
  useEffect(() => {
    setState(store.get());
    return store.subscribe(setState);
  }, [store]);
  return state;
}
