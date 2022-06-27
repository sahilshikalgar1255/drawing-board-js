import { terser } from 'rollup-plugin-terser';
import resolve from '@rollup/plugin-node-resolve';
import babel from '@rollup/plugin-babel';
import postcss from 'rollup-plugin-postcss';
import commonjs from '@rollup/plugin-commonjs';
import url from "@rollup/plugin-url";
const cssUrl = require("postcss-url")

export default {
  input: 'src/index.js',
  output: [
    {
      file: './dist/drawing-board-js.esm.js',
      format: 'es',
      name: 'DrawingBoardJs'
    },
    {
      file: './dist/drawing-board-js.min.js',
      format: 'iife',
      name: 'DrawingBoardJs'
    }
  ],
  plugins: [
    resolve(),
    postcss({
      modules: false,
      plugins: [cssUrl({url: 'inline'})]
    }),
    url(),
    commonjs({exclude: 'node_modules'}),
    babel({ babelHelpers: 'bundled', exclude: 'node_modules/**' }),
    terser()
  ]
}
