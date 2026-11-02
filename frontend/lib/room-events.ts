const ROOMS_CHANGED_EVENT = "chatapp:rooms-changed";

export function notifyRoomsChanged(): void {
  window.dispatchEvent(new Event(ROOMS_CHANGED_EVENT));
}

export function onRoomsChanged(listener: () => void): () => void {
  window.addEventListener(ROOMS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(ROOMS_CHANGED_EVENT, listener);
}
