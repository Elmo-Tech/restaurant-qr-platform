'use strict';

/**
 * Small, dependency-free CommonJS require shim needed only to run a
 * standalone ts-node script against this repository's generated Prisma
 * Client. That generated code (apps/api/src/generated/prisma/**) is emitted
 * for `moduleResolution: nodenext` and uses relative import specifiers with
 * an explicit `.js` extension (e.g. `./internal/class.js`) even though only
 * the `.ts` source file exists on disk -- this is correct and unremarkable
 * for the real build (`nest build` / `tsc` emits a sibling `.js` file next
 * to each `.ts` file, so the specifier resolves), and for Jest (which
 * already strips a trailing `.js` from relative specifiers via its own
 * `moduleNameMapper`, see apps/api/package.json). A bare `ts-node` run has
 * no such build step and no such mapper, so requiring these generated files
 * directly fails with `Cannot find module './internal/class.js'`.
 *
 * This shim closes that one gap for standalone scripts, mirroring Jest's
 * existing `moduleNameMapper` rule exactly: for a relative specifier ending
 * in `.js`, retry resolution with the extension stripped (letting Node's
 * own extension probing find the sibling `.ts` file via the `.ts` handler
 * ts-node registers), falling back to the original specifier untouched if
 * that fails. It changes no application behavior -- only how a standalone
 * script's own module graph is resolved -- and is loaded solely via
 * `node -r` for `npm run backfill:restaurant-locales*`, never by the NestJS
 * application itself.
 */
const Module = require('node:module');

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function patchedResolveFilename(request, ...rest) {
  if (/^\.{1,2}\//.test(request) && request.endsWith('.js')) {
    try {
      return originalResolveFilename.call(
        this,
        request.slice(0, -3),
        ...rest,
      );
    } catch (error) {
      // Fall through and try the original, unmodified request below.
    }
  }
  return originalResolveFilename.call(this, request, ...rest);
};
