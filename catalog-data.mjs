import { imageUrl } from "./album-data.mjs";

const ALBUM_ID = /^[a-f0-9]{32}$/;

export function normalizeCatalog(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.albums) || data.albums.length > 100) {
    throw new Error("Neplatný seznam alb.");
  }
  const ids = new Set();
  const albums = data.albums.map((raw) => {
    if (!raw || typeof raw.id !== "string" || !ALBUM_ID.test(raw.id) || ids.has(raw.id) ||
        typeof raw.title !== "string" || !raw.title.trim() || raw.title.length > 120 ||
        (raw.subtitle != null && (typeof raw.subtitle !== "string" || raw.subtitle.length > 180))) {
      throw new Error("Neplatné album v seznamu.");
    }
    ids.add(raw.id);
    const album = { id: raw.id, title: raw.title.trim(), subtitle: (raw.subtitle ?? "").trim() };
    if (raw.cover != null) album.cover = imageUrl(raw.cover);
    return album;
  });
  return albums;
}
