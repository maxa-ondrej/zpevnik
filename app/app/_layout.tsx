import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useTheme } from '../src/shared/store/theme';

export default function RootLayout() {
  const theme = useTheme();

  // On web, sync <body>'s background to the theme. Without this the
  // browser's default white shows through rubber-band / overscroll
  // edges and around the safe-area, breaking the illusion in dark
  // mode. No-op on native (no DOM).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = theme.bg;
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, [theme.bg]);

  return (
    <SafeAreaProvider>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: theme.text,
          headerTitleStyle: { color: theme.text },
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Zpěvník' }} />
        <Stack.Screen name="song/[id]" options={{ title: '' }} />
        <Stack.Screen name="setlists/index" options={{ title: 'Setlists' }} />
        <Stack.Screen name="setlists/[id]" options={{ title: 'Setlist' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
