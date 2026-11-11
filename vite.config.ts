import {defineConfig} from 'vite';

export default defineConfig({
  base:'./',
  build:{target:'es2022',outDir:'dist',chunkSizeWarningLimit:800},
  server:{port:5173,strictPort:true,fs:{deny:['**/.work/**','**/.runtime/**','**/workspaces/**','**/字体配套源码/**','**/.env*','**/.git/**','**/*.{crt,pem}']}},
});
