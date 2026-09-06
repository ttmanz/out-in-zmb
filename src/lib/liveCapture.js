import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import i18n from './i18n';
import { resizeForUpload } from './imageResize';

const launch = async (mediaType, videoMaxDuration = 60) => {
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: [mediaType],
    quality: 0.8,
    videoMaxDuration,
  });
  const asset = result.assets?.[0];
  if (result.canceled || !asset?.uri) return null;
  const isVideo = asset.type === 'video';
  const uri = isVideo ? asset.uri : await resizeForUpload(asset.uri);
  return { uri, isVideo };
};

// Opens the phone's native camera so the user can shoot something right now.
// First asks photo-or-video: Android's camera intent can't offer both in one
// launch (it silently falls back to photo), so we pick the mode explicitly and
// launch the matching capture UI on both platforms.
// Returns { uri, isVideo } on capture, or null if cancelled / permission denied.
export const captureLiveMedia = async () => {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(i18n.t('common.error'), i18n.t('common.cameraPermissionNeeded'));
    return null;
  }

  const mode = await new Promise((resolve) => {
    Alert.alert(
      i18n.t('common.live'),
      i18n.t('common.livePrompt'),
      [
        { text: i18n.t('common.livePhoto'), onPress: () => resolve('images') },
        { text: i18n.t('common.liveVideo'), onPress: () => resolve('videos') },
        { text: i18n.t('common.cancel'), style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
  if (!mode) return null;

  return launch(mode);
};

// Clip of the Day is video-only, capped at 3 minutes — no photo/video prompt needed.
export const captureClipVideo = async () => {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(i18n.t('common.error'), i18n.t('common.cameraPermissionNeeded'));
    return null;
  }
  return launch('videos', 180);
};
