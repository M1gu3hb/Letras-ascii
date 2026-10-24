// Preferences are separate from projects. Legacy keys are read for existing users.
const PREFIX = 'letras-ascii:';
export function getPreference(key, fallback = null) {
  try {
    const value = localStorage.getItem(PREFIX + key);
    if (value != null) return value;
    const legacy = localStorage.getItem(key);
    if (legacy != null) {
      localStorage.setItem(PREFIX + key, legacy);
      return legacy;
    }
  } catch {}
  return fallback;
}
export function setPreference(key, value) {
  try { localStorage.setItem(PREFIX + key, String(value)); } catch {}
}
