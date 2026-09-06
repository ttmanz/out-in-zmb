import { Image } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// Camera/gallery photos come through at full sensor resolution (often
// 3000px+ on a side) with no cap — a single post can cost several MB of
// the user's data. Downscaling to this before upload keeps photos sharp on
// any phone screen while cutting typical file sizes by 10-20x.
const MAX_EDGE = 1280;

const getSize = (uri) => new Promise((resolve, reject) => {
  Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
});

export const resizeForUpload = async (uri) => {
  try {
    const { width, height } = await getSize(uri);
    if (width <= MAX_EDGE && height <= MAX_EDGE) return uri;

    const context = ImageManipulator.manipulate(uri);
    if (width >= height) {
      context.resize({ width: MAX_EDGE, height: null });
    } else {
      context.resize({ width: null, height: MAX_EDGE });
    }
    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    return result.uri;
  } catch (e) {
    // Better to upload the original than to block the post entirely.
    return uri;
  }
};
