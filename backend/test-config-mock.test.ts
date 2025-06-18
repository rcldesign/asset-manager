import { config } from './src/config';

jest.mock('./src/config');

describe('Config Mock Test', () => {
  it('should allow modifying config.oidc', () => {
    expect(config).toBeDefined();
    (config as any).oidc = { test: 'value' };
    expect((config as any).oidc).toEqual({ test: 'value' });
  });
});
EOF < /dev/null
