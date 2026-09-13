import { relationshipThemes } from '../tokens';

describe('relationshipThemes', () => {
  it('keeps the Kin theme free while offering expressive premium choices', () => {
    const kinTheme = relationshipThemes.find((theme) => theme.id === 'kin');

    expect(kinTheme?.isPremium).toBe(false);
    expect(relationshipThemes.filter((theme) => theme.isPremium)).toHaveLength(3);
  });

  it('gives every relationship theme readable foreground and surface colors', () => {
    for (const theme of relationshipThemes) {
      expect(theme.accent).toMatch(/^#[0-9A-F]{6}$/);
      expect(theme.wallpaper).toMatch(/^#[0-9A-F]{6}$/);
      expect(theme.ink).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
