import { defineConfig } from 'vite';
import { cpSync } from 'node:fs';
export default defineConfig({
  base: './',
  plugins: [{name:'copy-catalog', closeBundle(){cpSync('data','dist/data',{recursive:true});}}],
});
