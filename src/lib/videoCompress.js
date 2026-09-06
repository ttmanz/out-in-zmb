import { Video } from 'react-native-compressor';

// Phone cameras record at full device-default quality (often 8-17 Mbps for
// 1080p, much more for 4K) with no size cap — a single minute of footage
// can cost 60-130MB+ of the user's data. Compressing before upload cuts
// that dramatically with no visible quality loss on a phone screen.
export const compressVideoForUpload = async (uri) => {
  try {
    return await Video.compress(uri, { compressionMethod: 'auto', maxSize: 1280 });
  } catch (e) {
    // Better to upload the original than to block the post entirely.
    return uri;
  }
};
