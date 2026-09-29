import { Image } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// Camera/gallery photos come through at full sensor resolution (often
// 3000px+ on a side) with no cap — a single post can cost several MB of
// the user's data. Downscaling to this before upload keeps photos sharp on
// any phone screen while cutting typical file sizes by 10-20x. Tuned for a
// data-cost-sensitive audience (prepaid mobile data is expensive in the
// target Southern Africa market) — still sharp at typical phone screen
// widths, just not archival quality.
const MAX_EDGE = 1024;

const getSize = (uri) => new Promise((resolve, reject) => {
  Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
});

// Receipts pass a larger maxEdge: they're tall, and at 1024px the small print
// on a till slip becomes unreadable.
export const resizeForUpload = async (uri, maxEdge = MAX_EDGE) => {
  try {
    const { width, height } = await getSize(uri);
    if (width <= maxEdge && height <= maxEdge) return uri;

    const context = ImageManipulator.manipulate(uri);
    if (width >= height) {
      context.resize({ width: maxEdge, height: null });
    } else {
      context.resize({ width: null, height: maxEdge });
    }
    const rendered = await context.renderAsync();
    const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.65 });
    return result.uri;
  } catch (e) {
    // Better to upload the original than to block the post entirely.
    return uri;
  }
};
