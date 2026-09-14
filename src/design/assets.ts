import type { ImageSourcePropType } from 'react-native';

export const kinAssets = {
  firstDate: require('../../assets/kin/first-date.jpg') as ImageSourcePropType,
  jamie: require('../../assets/kin/jamie.png') as ImageSourcePropType,
  jamieSticker: require('../../assets/kin/jamie-sticker.png') as ImageSourcePropType,
  lettersWallpaper: require('../../assets/kin/letters-wallpaper.png') as ImageSourcePropType,
  maya: require('../../assets/kin/maya.png') as ImageSourcePropType,
} as const;

const bundledImages: Record<string, ImageSourcePropType> = {
  'asset://kin/first-date': kinAssets.firstDate,
  'asset://kin/jamie': kinAssets.jamie,
  'asset://kin/jamie-sticker': kinAssets.jamieSticker,
  'asset://kin/maya': kinAssets.maya,
  'asset://kin/sticker-jamie-chef': kinAssets.jamieSticker,
};

export function kinImageSource(uri: string): ImageSourcePropType {
  return bundledImages[uri] ?? { uri };
}

export function kinWallpaperSource(wallpaperId?: string): ImageSourcePropType | null {
  return wallpaperId === 'letters' ? kinAssets.lettersWallpaper : null;
}
