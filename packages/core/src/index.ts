/**
 * Public surface of @lykos/core. Other packages import from "@lykos/core",
 * never from deep paths like "@lykos/core/src/types".
 *
 * Note the `.js` extensions below: under ESM + TypeScript's "NodeNext" resolution,
 * relative imports must reference the *compiled output* path (.js) even though the
 * source is .ts. This trips up everyone once — it's correct and required here.
 */

export * from "./config.js";
export * from "./sizing.js";
export * from "./types.js";
