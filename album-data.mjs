const OPU_HOST = "opu.peklo.biz";
const DEMO_PATH = /^demo\/photos\/[a-z0-9-]+\.(?:jpe?g|png)$/;

export function imageUrl(value, { demo = false } = {}) {
  if (typeof value !== "string" || !value) throw new Error("Chybí adresa fotografie.");
  if (demo && DEMO_PATH.test(value)) return value;
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("Neplatná adresa fotografie."); }
  if (parsed.protocol !== "https:" || parsed.hostname !== OPU_HOST || parsed.port ||
      parsed.username || parsed.password || parsed.search || parsed.hash ||
      !/^\/p\/[a-z0-9_./-]+\.(?:jpe?g|png|webp)$/i.test(parsed.pathname)) {
    throw new Error("Fotografie musí být na OPU.");
  }
  return parsed.href;
}

export function thumbnailUrl(source) {
  if (!source.startsWith("https://opu.peklo.biz/p/")) return source;
  const url = new URL(source);
  const lastSlash = url.pathname.lastIndexOf("/");
  if (url.pathname.slice(0, lastSlash).endsWith("/thumbs")) return source;
  url.pathname = `${url.pathname.slice(0, lastSlash)}/thumbs${url.pathname.slice(lastSlash)}`;
  return url.href;
}

export function normalizeAlbum(data, { demo = false } = {}) {
  if (!data || data.version !== 1 || typeof data.title !== "string" ||
      !data.title.trim() || data.title.length > 120 || !Array.isArray(data.photos) ||
      data.photos.length > 200) {
    throw new Error("Neplatný soubor galerie.");
  }
  const subtitle = data.subtitle ?? "";
  if (typeof subtitle !== "string" || subtitle.length > 180) throw new Error("Neplatný popis galerie.");
  const ids = new Set();
  const photos = data.photos.map((raw) => {
    if (!raw || typeof raw.id !== "string" || !/^[a-z0-9_-]{1,64}$/i.test(raw.id) || ids.has(raw.id)) {
      throw new Error("Fotografie potřebují jedinečná ID.");
    }
    ids.add(raw.id);
    const src = imageUrl(raw.src, { demo });
    const thumb = raw.thumb == null ? thumbnailUrl(src) : imageUrl(raw.thumb, { demo });
    const caption = raw.caption ?? "";
    if (typeof caption !== "string" || caption.length > 180) throw new Error("Neplatný popisek fotografie.");
    return { id: raw.id, src, thumb, caption: caption.trim() };
  });
  return { title: data.title.trim(), subtitle: subtitle.trim(), photos };
}

export function photoCountLabel(count) {
  if (count === 1) return "1 fotka";
  if (count >= 2 && count <= 4) return `${count} fotky`;
  return `${count} fotek`;
}
