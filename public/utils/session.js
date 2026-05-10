const KEY = 'dd_player';

export function getSession() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(player) {
  localStorage.setItem(KEY, JSON.stringify(player));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}