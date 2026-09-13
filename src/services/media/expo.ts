import * as ImagePicker from 'expo-image-picker';

import type { MediaPicker, PickedImage } from './contracts';
import { MediaPermissionError } from './contracts';

export const expoMediaPicker: MediaPicker = {
  async pickImage(): Promise<PickedImage | null> {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new MediaPermissionError();

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      mediaTypes: ['images'],
      quality: 0.86,
    });
    if (result.canceled) return null;

    const asset = result.assets[0];
    return {
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      mimeType: asset.mimeType ?? undefined,
    };
  },
};
