export const colors = {
  parchment: '#F8F3ED',
  paper: '#FFFDF9',
  plumInk: '#2F232B',
  mutedInk: '#766A70',
  keyline: '#E7DDD6',
  rose: '#A64B68',
  danger: '#9C3945',
  success: '#477763',
} as const;

export const typography = {
  body: 'Manrope_400Regular',
  bodyStrong: 'Manrope_700Bold',
  display: 'Fraunces_700Bold',
  label: 'Manrope_800ExtraBold',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 10,
  md: 16,
  lg: 24,
  round: 999,
} as const;

export const relationshipThemes = [
  {
    id: 'kin',
    name: 'Kin',
    accent: '#A64B68',
    wallpaper: '#F7EFE9',
    ink: '#2F232B',
    isPremium: false,
  },
  {
    id: 'moonlit',
    name: 'Moonlit',
    accent: '#7765A8',
    wallpaper: '#EEEAF5',
    ink: '#292538',
    isPremium: true,
  },
  {
    id: 'marigold',
    name: 'Marigold',
    accent: '#B66B20',
    wallpaper: '#FBF0D8',
    ink: '#352A1E',
    isPremium: true,
  },
  {
    id: 'evergreen',
    name: 'Evergreen',
    accent: '#477763',
    wallpaper: '#E7F0EA',
    ink: '#20332B',
    isPremium: true,
  },
] as const;

export type RelationshipThemeId = (typeof relationshipThemes)[number]['id'];

export const relationshipWallpapers = [
  { id: 'paper', name: 'Quiet paper', pattern: 'plain', isPremium: false },
  { id: 'letters', name: 'Love letters', pattern: 'postmarks', isPremium: false },
  { id: 'constellations', name: 'Constellations', pattern: 'stars', isPremium: true },
  { id: 'botanical', name: 'Pressed botanicals', pattern: 'leaves', isPremium: true },
] as const;

export type RelationshipWallpaperId = (typeof relationshipWallpapers)[number]['id'];
