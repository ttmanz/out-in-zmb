import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const ICON_GRADIENT = ['#fdd07d', '#fc8a03']; // light gold → deep gold
const RING_GRADIENT = ['#fdd07d', '#fdab53', '#fc8a03']; // stroke gradient, reversed

// An Ionicon filled with a linear gradient.
export const GradientIcon = ({
  name,
  size = 24,
  colors = ICON_GRADIENT,
  start = { x: 0, y: 0 },
  end = { x: 1, y: 1 },
}) => (
  <MaskedView
    style={{ width: size, height: size }}
    maskElement={
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={name} size={size} color="#000" />
      </View>
    }
  >
    <LinearGradient colors={colors} start={start} end={end} style={{ width: size, height: size }} />
  </MaskedView>
);

// Icon inside a gradient-stroked circle with a dark glassy well. Pass `image`
// for one of the brand's pre-made full-color icon assets, or `name` to fall
// back to a gradient-filled Ionicon.
export const GradientIconCircle = ({ name, image, size = 52, iconSize = 24, style }) => (
  <LinearGradient
    colors={RING_GRADIENT}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={[{ width: size, height: size, borderRadius: size / 2, padding: 1.5 }, styles.glow, style]}
  >
    <View style={[styles.well, { borderRadius: size / 2 - 1.5 }]}>
      {image
        ? <Image source={image} style={{ width: iconSize * 1.5, height: iconSize * 1.5 }} resizeMode="contain" />
        : <GradientIcon name={name} size={iconSize} />
      }
    </View>
  </LinearGradient>
);

const styles = StyleSheet.create({
  glow: {
    shadowColor: '#fdab53',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
  },
  well: {
    flex: 1,
    backgroundColor: 'rgba(6,35,31,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default GradientIcon;
