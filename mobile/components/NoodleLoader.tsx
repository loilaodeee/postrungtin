import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

export default function NoodleLoader({ message = 'Đang tải dữ liệu...' }) {
  const chopstickRotate = useRef(new Animated.Value(0)).current;
  const chopstickY = useRef(new Animated.Value(0)).current;
  const steamOpacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Chopstick tapping animation loop
    Animated.loop(
      Animated.sequence([
        // Chopstick moves down & tilts to tap
        Animated.parallel([
          Animated.timing(chopstickRotate, {
            toValue: 1,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.timing(chopstickY, {
            toValue: 1,
            duration: 250,
            useNativeDriver: true,
          })
        ]),
        // Chopstick bounces back up
        Animated.parallel([
          Animated.timing(chopstickRotate, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(chopstickY, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          })
        ]),
      ])
    ).start();

    // Steam rising animation loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(steamOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(steamOpacity, {
          toValue: 0.3,
          duration: 600,
          useNativeDriver: true,
        })
      ])
    ).start();
  }, []);

  // Map animated values to rotations and offsets
  const rotateDeg = chopstickRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['-12deg', '10deg'],
  });

  const translateY = chopstickY.interpolate({
    inputRange: [0, 1],
    outputRange: [-6, 6],
  });

  return (
    <View style={styles.container}>
      <View style={styles.loaderBox}>
        <View style={styles.animationArea}>
          {/* Animated Steam */}
          <Animated.View style={[styles.steamContainer, { opacity: steamOpacity }]}>
            <Text style={styles.steamText}>░  ░  ░</Text>
          </Animated.View>

          {/* Animated Chopsticks */}
          <Animated.View style={[
            styles.chopsticks,
            { transform: [{ rotate: rotateDeg }, { translateY: translateY }] }
          ]}>
            <Text style={styles.chopsticksEmoji}>🥢</Text>
          </Animated.View>

          {/* Bowl */}
          <Text style={styles.bowlEmoji}>🍜</Text>
        </View>

        {/* Loading text status */}
        <Text style={styles.statusText}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.4)', // Glassmorphism backdrop overlay
  },
  loaderBox: {
    backgroundColor: '#ffffff',
    paddingVertical: 28,
    paddingHorizontal: 36,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    elevation: 10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
  },
  animationArea: {
    width: 100,
    height: 100,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  steamContainer: {
    position: 'absolute',
    top: 15,
    alignItems: 'center',
    zIndex: 1,
  },
  steamText: {
    fontSize: 12,
    color: '#cbd5e1',
    fontWeight: '800',
    letterSpacing: 2,
  },
  chopsticks: {
    position: 'absolute',
    top: 5,
    zIndex: 3,
  },
  chopsticksEmoji: {
    fontSize: 34,
  },
  bowlEmoji: {
    fontSize: 54,
    position: 'absolute',
    bottom: 8,
    zIndex: 2,
  },
  statusText: {
    marginTop: 16,
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.3,
  },
});
