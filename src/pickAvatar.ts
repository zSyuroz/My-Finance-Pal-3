import { Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/** A picture the user chose, before it has been framed. */
export type PickedImage = { uri: string; width: number; height: number };

/** The square the user framed, in the source image's own pixels. */
export type CropBox = { originX: number; originY: number; size: number };

/** What the avatar is saved at — bigger than it is ever drawn, small enough to
 *  sit inline in the database and inside every backup. */
const AVATAR_PX = 512;

/**
 * Opens the photo library and returns the picture untouched.
 *
 * The framing used to be left to the operating system's own crop screen, which
 * exists on a phone and does not exist on the web — there the picture was
 * taken whole and whatever fell outside the circle was simply lost. The app
 * frames it itself now, so this only has to fetch the original.
 *
 * Returns null when the user backs out, which is not an error.
 */
export async function pickImage(): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error(
      'The app needs permission to open your photos. You can grant it in your device settings.'
    );
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  if (!asset.uri) return null;

  // Dimensions drive the whole cropper, and some platforms hand back zeroes,
  // so measure the picture ourselves when they do.
  if (asset.width > 0 && asset.height > 0) {
    return { uri: asset.uri, width: asset.width, height: asset.height };
  }
  const measured = await measure(asset.uri);
  return { uri: asset.uri, width: measured.width, height: measured.height };
}

/**
 * Cuts the framed square out of the original and returns it as a data URI.
 *
 * Downscaled and re-encoded on the way through: the result is stored inline in
 * the database, so a 4MB camera original would travel inside every backup for
 * a picture drawn at 96 points.
 */
export async function cropToAvatar(image: PickedImage, box: CropBox): Promise<string> {
  const size = Math.max(1, Math.round(box.size));
  const result = await manipulateAsync(
    image.uri,
    [
      {
        crop: {
          originX: clamp(Math.round(box.originX), 0, Math.max(0, image.width - size)),
          originY: clamp(Math.round(box.originY), 0, Math.max(0, image.height - size)),
          width: size,
          height: size,
        },
      },
      { resize: { width: AVATAR_PX, height: AVATAR_PX } },
    ],
    { compress: 0.7, format: SaveFormat.JPEG, base64: true }
  );

  if (result.base64) return `data:image/jpeg;base64,${result.base64}`;
  // Native returns a file:// path rather than base64 unless it feels like it;
  // the uri still renders for this session and survives a restart on disk.
  return result.uri;
}

function measure(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => reject(new Error('That picture could not be read.'))
    );
  });
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
