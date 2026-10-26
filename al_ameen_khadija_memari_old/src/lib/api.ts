import { Platform } from 'react-native';
import { getToken, refreshSession } from './auth';

const configuredApiBase = process.env.EXPO_PUBLIC_API_BASE_URL
  ?.replace(/\/+$/, '');

const isLocalNetworkHost = (host: string) =>
  ['localhost', '127.0.0.1'].includes(host) ||
  /^192\.168\./.test(host) ||
  /^10\./.test(host) ||
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
  host.endsWith('.local');

export const getApiBase = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    if (host.endsWith('.onrender.com')) {
      return 'https://alameenk.onrender.com';
    }
    if (isLocalNetworkHost(host) || (window.location.port && ['8081', '8082', '8083', '19006'].includes(window.location.port))) {
      return `${window.location.protocol}//${host}:3000`;
    }
  }
  return configuredApiBase || 'https://alameenk.onrender.com';
};

export const API_BASE = getApiBase();

export const imageUrl = (url?: string | null) => {
  if (!url) return '';
  if (/^https?:/.test(url)) return url;
  const base = Platform.OS === 'web' ? getApiBase() : API_BASE;
  const cleanUrl = url.startsWith('/') ? url : `/${url}`;
  return `${base}${cleanUrl}`;
};

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

  const activeApiBase = Platform.OS === 'web' ? getApiBase() : API_BASE;

  try {
    const response = await fetch(
      `${activeApiBase}${path}`,
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

    if (path === '/api/change-password') await refreshSession();
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
