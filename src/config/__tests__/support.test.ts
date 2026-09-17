import { createSupportMailto, normalizeSupportEmail } from '../support';

describe('support configuration', () => {
  it('accepts reachable-looking addresses and builds a safe mail link', () => {
    expect(normalizeSupportEmail(' Help@Kin-App.com ')).toBe('help@kin-app.com');
    expect(createSupportMailto('help@kin-app.com')).toBe('mailto:help@kin-app.com?subject=Kin%20support');
  });

  it.each([
    'support@localhost',
    'support@kin.invalid',
    'support@kin.example',
    'support@kin.test',
    'not-an-email',
  ])('rejects non-routable or malformed support address %s', (email) => {
    expect(normalizeSupportEmail(email)).toBeNull();
  });
});
