// Moved to ../scripts/hooks.mjs — the loader is shared by the tests and by
// `npm run run:inline`, so it lives with the other tooling now.
// This shim only exists because the file could not be deleted automatically;
// it is safe to remove.
export * from "../scripts/hooks.mjs";
