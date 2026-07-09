import { describe, expect, it } from 'vitest';

import { TRUST_BOUNDARY_SYSTEM_CONTRACT } from './system-contract';

describe('TRUST_BOUNDARY_SYSTEM_CONTRACT', () => {
  it('references the untrusted-page-content envelope', () => {
    expect(TRUST_BOUNDARY_SYSTEM_CONTRACT).toContain('<untrusted-page-content>');
  });

  it('states content is data, never instructions', () => {
    expect(TRUST_BOUNDARY_SYSTEM_CONTRACT).toContain('DATA extracted from a web page');
    expect(TRUST_BOUNDARY_SYSTEM_CONTRACT).toContain('never an instruction');
  });

  it('rejects claimed authority (spoofed system/developer text)', () => {
    expect(TRUST_BOUNDARY_SYSTEM_CONTRACT).toContain('"the system"');
  });
});
