import { createInviteUrl, normalizeInviteCode } from '../inviteLinks';

describe('invite links', () => {
  it('normalizes human-entered invitation codes', () => {
    expect(normalizeInviteCode('  kin123  ')).toBe('KIN123');
    expect(normalizeInviteCode('abcdef123456')).toBe('ABCDEF123456');
  });

  it.each(['', 'SHORT', 'TOO-LONG-OR-PUNCTUATED', 'SPACE 1']) (
    'rejects invalid invitation code %s',
    (code) => {
      expect(normalizeInviteCode(code)).toBeNull();
    },
  );

  it('builds a link containing only the normalized code in the invitation path', () => {
    expect(createInviteUrl('https://kin.example/', ' kin123 '))
      .toBe('https://kin.example/invite/KIN123');
    expect(createInviteUrl('https://kin.example/app', 'abcdef123456'))
      .toBe('https://kin.example/app/invite/ABCDEF123456');
    expect(createInviteUrl('http://[::1]:8081', 'kin123'))
      .toBe('http://[::1]:8081/invite/KIN123');
  });

  it('refuses malformed URLs and invitation codes', () => {
    expect(() => createInviteUrl('javascript:alert(1)', 'KIN123')).toThrow('public app URL');
    expect(() => createInviteUrl('https://kin.example', '../secret')).toThrow('invitation code');
  });
});
