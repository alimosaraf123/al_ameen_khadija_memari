import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack screenOptions={{ headerTitleAlign: 'center' }}>
      <Stack.Screen name="guardian" options={{ headerShown: false }} />
      <Stack.Screen name="superadmin" options={{ headerShown: false }} />
      <Stack.Screen name="students" options={{ headerShown: false }} />
      <Stack.Screen name="student-transfer" options={{ headerShown: false }} />
    </Stack>
  );
}
