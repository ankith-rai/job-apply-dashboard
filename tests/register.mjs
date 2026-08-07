import { register } from "node:module";

// Resolve the hook relative to this file rather than the cwd, so the tests run
// from anywhere in the project.
register("./hooks.mjs", import.meta.url);
