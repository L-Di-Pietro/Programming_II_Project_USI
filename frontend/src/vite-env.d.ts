/// <reference types="vite/client" />

declare module "plotly.js-dist-min" {
  // The minified distribution exports the same API as plotly.js; the upstream
  // @types/plotly.js package (pulled in transitively via @types/react-plotly.js)
  // describes it accurately.
  export * from "plotly.js";
  export { default } from "plotly.js";
}
