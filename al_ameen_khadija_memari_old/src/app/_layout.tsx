import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="guardian" options={{ headerShown: false }} />
      <Stack.Screen name="teacher" options={{ headerShown: false }} />
      <Stack.Screen name="routines" options={{ headerShown: false }} />
      <Stack.Screen name="notices" options={{ headerShown: false }} />
      <Stack.Screen name="superadmin" options={{ headerShown: false }} />
      <Stack.Screen name="students" options={{ headerShown: false }} />
      <Stack.Screen name="student-transfer" options={{ headerShown: false }} />
      <Stack.Screen name="gateman" options={{ headerShown: false }} />
      <Stack.Screen name="office" options={{ headerShown: false }} />
      <Stack.Screen name="library" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
    </Stack>
  );
}
