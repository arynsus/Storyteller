// The installed cheerio version ships proper types for the "slim" subpath
// export, but resolving it requires "moduleResolution": "bundler"/"node16"
// (which this project's tsconfig doesn't use). Vite/esbuild resolve the real
// subpath fine at build/run time regardless -- this shim just satisfies `tsc`.
declare module "cheerio/slim" {
    export * from "cheerio";
}
