import { Platform } from 'react-native';
import { getToken } from './auth';

const MOBILE_API =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  'http://192.168.0.189:3000';

export const API_BASE =
  Platform.OS === 'web'
    ? 'http://localhost:3000'
    : MOBILE_API;

export async function api(
  path: string,
  options: RequestInit = {}
) {
  const token = await getToken();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };

  if (
    !(
      typeof FormData !== 'undefined' &&
      options.body instanceof FormData
    )
  ) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    15000
  );

  try {
    const response = await fetch(
      `${API_BASE}${path}`,
      {
        ...options,
        headers,
        signal: controller.signal,
      }
    );

    const text = await response.text();

    let data: any;

    try {
      data = text
        ? JSON.parse(text)
        : {};
    } catch {
      data = {
        message: text,
      };
    }

    if (!response.ok) {
      throw new Error(
        data.message ||
          `Request failed (${response.status})`
      );
    }

    return data;

  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(
        'Server connection timed out'
      );
    }

    throw error;

  } finally {
    clearTimeout(timeout);
  }
}
