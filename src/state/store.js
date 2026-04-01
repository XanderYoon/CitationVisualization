export function createStore(initialState) {
  let state = { ...initialState };
  const listeners = new Set();

  return {
    getState() {
      return state;
    },
    setState(patch) {
      const nextState = { ...state, ...patch };
      const changed = Object.keys(nextState).some((key) => nextState[key] !== state[key]);
      if (!changed) {
        return;
      }
      state = nextState;
      listeners.forEach((listener) => listener(state));
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
  };
}
