import { Video } from 'react-native-compressor';

// Phone cameras record at full device-default quality (often 8-17 Mbps for
// 1080p, much more for 4K) with no size cap — a single minute of footage
// can cost 60-130MB+ of the user's data. 'auto' left the bitrate up to the
// library's own heuristics, which could still land high on newer phones —
// pinning it explicitly gives a predictable, data-cost-sensitive size
// regardless of source device (target market is prepaid mobile data in
// Southern Africa, where that matters a lot). At 1.2 Mbps / 960px, a
// 1-minute clip lands around 9MB instead of 60-130MB+, still watchable at
// phone screen size.
export const compressVideoForUpload = async (uri) => {
  try {
    return await Video.compress(uri, { compressionMethod: 'manual', bitrate: 1_200_000, maxSize: 960 });
  } catch (e) {
    // Better to upload the original than to block the post entirely.
    return uri;
  }
};
