import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Tests unitaires uniquement : les parcours de bout en bout (e2e/) passent par Playwright.
export default mergeConfig(viteConfig, defineConfig({ test: { include: ['tests/**/*.test.ts'] } }));
