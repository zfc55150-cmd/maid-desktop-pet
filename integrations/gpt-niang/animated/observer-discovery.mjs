// Source-tree shim only. Packages install the maintained implementation next to
// both observers, so their import specifier stays identical in tests and runtime.
export * from '../maintenance/runtime/observer-discovery.mjs';
