import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base ('./') so the same build works on a GitHub Pages project site,
// Netlify, Vercel, or any sub-folder host — no base-path guessing.
export default defineConfig({
  base: './',
  plugins: [react()],
});
