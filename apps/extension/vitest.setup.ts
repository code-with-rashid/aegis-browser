import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// @testing-library/react's built-in auto-cleanup only registers itself when it detects
// Jest-style test globals; since this project doesn't enable vitest's `globals` option,
// each rendered component would otherwise accumulate in the DOM across tests in one file.
afterEach(() => {
  cleanup();
});
