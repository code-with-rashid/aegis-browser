import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to this package's bundled fixture HTML files (`src/fixtures/*.html`). */
export const FIXTURES_DIR = path.join(HERE, 'fixtures');
