// diagram-store.js
// Local persistence for user-built diagrams. Stored in localStorage (Electron's
// userData profile) under a single key — never written to the repo, never in
// git, and untouched by the self-update (git pull + rebuild + reload).
//
// Storage is injectable so the logic is unit-testable without a browser.

export const STORE_KEY = "lcd1.savedDiagrams";

export function createDiagramStore(storage) {
  const store =
    storage || (typeof localStorage !== "undefined" ? localStorage : null);
  if (!store) throw new Error("no storage available for diagram store");

  let seq = 0;
  const read = () => {
    try {
      const arr = JSON.parse(store.getItem(STORE_KEY));
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };
  const write = (arr) => store.setItem(STORE_KEY, JSON.stringify(arr));
  const cleanName = (name) => String(name ?? "").trim() || "Untitled";

  return {
    // Newest first.
    list() {
      return read().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    },
    get(id) {
      return read().find((d) => d.id === id) || null;
    },
    // Save under a name. Saving an existing name overwrites it in place.
    // Returns the entry id. `now` is injectable for tests.
    save(name, state, now = Date.now()) {
      const nm = cleanName(name);
      const arr = read();
      const existing = arr.find((d) => d.name === nm);
      if (existing) {
        existing.state = state;
        existing.savedAt = now;
        write(arr);
        return existing.id;
      }
      const id = `d_${now}_${seq++}`;
      arr.push({ id, name: nm, savedAt: now, state });
      write(arr);
      return id;
    },
    rename(id, name) {
      const arr = read();
      const d = arr.find((x) => x.id === id);
      if (!d) return false;
      d.name = cleanName(name);
      write(arr);
      return true;
    },
    remove(id) {
      const arr = read();
      const next = arr.filter((d) => d.id !== id);
      write(next);
      return next.length !== arr.length;
    },
  };
}
