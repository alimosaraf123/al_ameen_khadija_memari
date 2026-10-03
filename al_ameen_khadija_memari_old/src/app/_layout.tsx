import { Stack } from 'expo-router';
import RoleHomeButton from '../components/RoleHomeButton';

export default function Layout() {
  return (
    <Stack screenOptions={{ headerTitleAlign: 'center', headerRight: () => <RoleHomeButton /> }}>
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
