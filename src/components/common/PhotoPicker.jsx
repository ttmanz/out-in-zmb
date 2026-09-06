import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import { COLORS } from '../../constants/colors';
import { resizeForUpload } from '../../lib/imageResize';

const isVideoUri = (u) => /\.(mp4|mov|m4v|avi|mkv)(\?.*)?$/i.test(u ?? '');

const VideoPreview = ({ uri, style }) => {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; });
  return <VideoView player={player} style={style} contentFit="cover" nativeControls />;
};

const PhotoPicker = ({ uri, onChange, aspect = [16, 9], allowVideo = false }) => {
  const pick = async () => {
    // iOS's picker (PHPicker) runs out-of-process and needs no photo-library
    // permission — requesting it manually shows a redundant native dialog
    // that blocks the picker from presenting afterward. Android still needs it.
    if (Platform.OS === 'android') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow photo library access to add media.');
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: allowVideo ? ['images', 'videos'] : ['images'],
      allowsEditing: !allowVideo,
      aspect: allowVideo ? undefined : aspect,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      const asset = result.assets[0];
      const uri = asset.type === 'video' ? asset.uri : await resizeForUpload(asset.uri);
      onChange(uri, asset.type);
    }
  };

  if (uri) {
    return (
      <View style={styles.previewWrap}>
        {isVideoUri(uri)
          ? <VideoPreview uri={uri} style={styles.preview} />
          : <Image source={{ uri }} style={styles.preview} resizeMode="cover" />
        }
        <TouchableOpacity style={styles.removeBtn} onPress={() => onChange(null)}>
          <Text style={styles.removeBtnText}>✕ Remove</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity style={styles.addBtn} onPress={pick}>
      <Text style={styles.addBtnIcon}>{allowVideo ? '🎬' : '📷'}</Text>
      <Text style={styles.addBtnText}>{allowVideo ? 'Add Photo or Video' : 'Add photo'}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: COLORS.borderAccent,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 16,
    backgroundColor: 'rgba(253,171,83,0.04)',
  },
  addBtnIcon: { fontSize: 22 },
  addBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.primary },
  previewWrap: { marginBottom: 16 },
  preview: { width: '100%', height: 180, borderRadius: 12, marginBottom: 8 },
  removeBtn: { alignSelf: 'flex-start' },
  removeBtnText: { fontSize: 13, color: COLORS.error, fontWeight: '600' },
});

export default PhotoPicker;
