import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SETTINGS, Settings } from './simulation';

const KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // best-effort; non-fatal
  }
}

export async function clearStorage(): Promise<void> {
  try {
    await AsyncStorage.clear();
  } catch {
    // best-effort
  }
}
