// Shared by graph-integrity.test.mjs and graph-integrity.overlap.test.mjs, which
// both build word-boundary matchers over component names -- one definition so the
// two gates cannot disagree about which names are matchable.
export const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
