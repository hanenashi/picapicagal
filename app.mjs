import { normalizeAlbum, photoCountLabel } from "./album-data.mjs";
import { normalizeCatalog } from "./catalog-data.mjs";
import { decryptAlbum, normalizeEncryptedAccess, unlockAlbums } from "./crypto-data.mjs";

const accessGate = document.querySelector("#access-gate");
const accessForm = document.querySelector("#access-form");
const accessInput = document.querySelector("#access-passphrase");
const accessMessage = document.querySelector("#access-message");
const mainContent = document.querySelector("#main-content");
const albumHome = document.querySelector("#album-home");
const albumCards = document.querySelector("#album-cards");
const albumBack = document.querySelector("#album-back");
const gallery = document.querySelector("#gallery");
const emptyState = document.querySelector("#empty-state");
const errorState = document.querySelector("#error-state");
const viewer = document.querySelector("#viewer");
const stage = document.querySelector("#viewer-stage");
const viewerImage = document.querySelector("#viewer-image");
const viewerError = document.querySelector("#viewer-error");
const viewerCount = document.querySelector("#viewer-count");
const viewerCaption = document.querySelector("#viewer-caption");
const originalLink = document.querySelector("#viewer-original");

let album = null;
let currentIndex = 0;
let lastTile = null;
let savedScroll = 0;
let viewerEntry = false;
let zoom = { scale: 1, x: 0, y: 0 };
const pointers = new Map();
let gesture = null;
let lastTap = null;
let catalog = [];
let albumKeys = new Map();
let release = null;
let routeGeneration = 0;

function showHome() {
  routeGeneration++;
  albumHome.hidden = false;
  gallery.hidden = true;
  emptyState.hidden = true;
  errorState.hidden = true;
  albumBack.hidden = true;
  document.querySelector("#album-title").textContent = "Naše alba";
  document.querySelector("#album-subtitle").textContent = "Fotky, které sdílíme";
  document.querySelector("#album-subtitle").hidden = false;
  document.querySelector("#photo-count").hidden = true;
  document.title = "Naše alba · Picapica";
  albumCards.replaceChildren();
  for (const item of catalog) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "album-card";
    const title = document.createElement("strong");
    title.textContent = item.title;
    const subtitle = document.createElement("span");
    subtitle.textContent = item.subtitle;
    const label = document.createElement("span");
    label.className = "album-card-label";
    label.append(title);
    if (item.subtitle) label.append(subtitle);
    if (item.cover) {
      const cover = document.createElement("img");
      cover.className = "album-cover";
      cover.alt = "";
      cover.loading = "lazy";
      cover.decoding = "async";
      cover.addEventListener("load", () => card.classList.add("has-cover"), { once: true });
      cover.addEventListener("error", () => cover.remove(), { once: true });
      cover.src = item.cover;
      card.append(cover);
    }
    card.append(label);
    card.addEventListener("click", () => openAlbum(item.id, true));
    albumCards.append(card);
  }
}

function albumPath(id) {
  return `./albums/${id}.json`;
}

function openAlbum(id, push = false) {
  if (!albumKeys.has(id)) {
    showHome();
    return;
  }
  if (push) {
    const url = new URL(location.href);
    url.searchParams.delete("demo");
    url.searchParams.set("album", id);
    url.hash = "";
    history.pushState({ album: id }, "", url);
  }
  loadAlbum(albumPath(id), { encryptedId: id });
}

function route() {
  const params = new URLSearchParams(location.search);
  if (params.get("demo") === "1") {
    accessGate.hidden = true;
    mainContent.hidden = false;
    loadAlbum("./demo/album.json", { demo: true });
    return;
  }
  if (!release) {
    mainContent.hidden = true;
    accessGate.hidden = false;
    return;
  }
  const requested = params.get("album");
  const item = catalog.find((candidate) => candidate.id === requested || candidate.legacy === requested);
  if (item) {
    if (requested !== item.id) {
      const url = new URL(location.href);
      url.searchParams.set("album", item.id);
      history.replaceState(null, "", url);
    }
    openAlbum(item.id);
  } else {
    showHome();
  }
}

async function checkAccess() {
  try { sessionStorage.removeItem("picapica-access"); } catch { /* Storage may be disabled. */ }
  if (new URLSearchParams(location.search).get("demo") === "1") route();
  else accessGate.hidden = false;
  const submit = accessForm.querySelector("button");
  accessForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    accessMessage.textContent = "Otevírám alba…";
    try {
      const response = await fetch("./access.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Guest access unavailable");
      const config = normalizeEncryptedAccess(await response.json());
      const unlocked = await unlockAlbums(config, accessInput.value);
      if (!unlocked) {
        accessMessage.textContent = "Tohle heslo nesedí. Zkus to ještě jednou.";
        accessInput.select();
        return;
      }
      const normalized = normalizeCatalog({ version: 1, albums: unlocked });
      for (const key of albumKeys.values()) key.fill(0);
      albumKeys = new Map(unlocked.map((item) => [item.id, item.key]));
      catalog = normalized.map((item, index) => ({ ...item, legacy: unlocked[index].legacy }));
      release = config.release;
      accessGate.hidden = true;
      mainContent.hidden = false;
      accessForm.reset();
      accessMessage.textContent = "";
      route();
    } catch {
      accessMessage.textContent = "Alba teď nejdou otevřít. Zkus to později.";
    } finally {
      submit.disabled = false;
    }
  });
}

async function loadAlbum(manifestPath, { demo = false, encryptedId = null } = {}) {
  const generation = ++routeGeneration;
  albumHome.hidden = true;
  albumBack.hidden = false;
  gallery.hidden = true;
  emptyState.hidden = true;
  errorState.hidden = true;
  try {
    const response = await fetch(manifestPath, { cache: "no-store" });
    if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
    const data = await response.json();
    const manifest = encryptedId ? await decryptAlbum(release, encryptedId, albumKeys.get(encryptedId), data) : data;
    const loaded = normalizeAlbum(manifest, { demo });
    if (generation !== routeGeneration) return;
    album = loaded;
    renderAlbum();
  } catch (error) {
    if (generation !== routeGeneration) return;
    console.error("Gallery load failed:", error);
    errorState.hidden = false;
  }
}

function renderAlbum() {
  document.title = `${album.title} · Picapica`;
  document.querySelector("#album-title").textContent = album.title;
  const subtitle = document.querySelector("#album-subtitle");
  subtitle.textContent = album.subtitle;
  subtitle.hidden = !album.subtitle;
  document.querySelector("#photo-count").textContent = photoCountLabel(album.photos.length);
  document.querySelector("#photo-count").hidden = false;
  gallery.replaceChildren();

  if (album.photos.length === 0) {
    emptyState.hidden = false;
    return;
  }

  const fragment = document.createDocumentFragment();
  album.photos.forEach((photo, index) => {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "photo-tile";
    tile.setAttribute("aria-label", `Otevřít fotografii ${index + 1} z ${album.photos.length}`);
    const image = document.createElement("img");
    image.alt = "";
    image.loading = index < 6 ? "eager" : "lazy";
    image.decoding = "async";
    image.src = photo.thumb;
    let triedOriginal = photo.thumb === photo.src;
    image.onerror = () => {
      if (!triedOriginal) {
        triedOriginal = true;
        image.src = photo.src;
        return;
      }
      image.remove();
      tile.classList.add("photo-error");
      tile.textContent = "Fotka není dostupná";
    };
    tile.append(image);
    tile.addEventListener("click", () => openViewer(index, tile));
    fragment.append(tile);
  });
  gallery.append(fragment);
  gallery.hidden = false;
}

function resetZoom() {
  zoom = { scale: 1, x: 0, y: 0 };
  pointers.clear();
  gesture = null;
  lastTap = null;
  viewerImage.style.transform = "";
}

function applyZoom() {
  viewerImage.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`;
}

function toggleZoom() {
  if (zoom.scale > 1) resetZoom();
  else { zoom.scale = 2; applyZoom(); }
}

function showPhoto(index) {
  if (!album?.photos.length) return;
  currentIndex = (index + album.photos.length) % album.photos.length;
  const photo = album.photos[currentIndex];
  resetZoom();
  viewerError.hidden = true;
  viewerImage.hidden = false;
  viewerImage.alt = photo.caption || `Fotografie ${currentIndex + 1}`;
  viewerImage.src = photo.src;
  viewerCount.textContent = `${currentIndex + 1} / ${album.photos.length}`;
  viewerCaption.textContent = photo.caption;
  originalLink.href = photo.src;
}

function openViewer(index, tile) {
  lastTile = tile;
  savedScroll = window.scrollY;
  showPhoto(index);
  viewer.showModal();
  document.body.style.overflow = "hidden";
  viewerEntry = true;
  history.pushState({ picapicaViewer: true }, "", `#foto-${album.photos[index].id}`);
  document.querySelector("#viewer-close").focus();
}

function hideViewer() {
  if (!viewer.open) return;
  viewer.close();
  document.body.style.overflow = "";
  viewerImage.removeAttribute("src");
  resetZoom();
  window.scrollTo(0, savedScroll);
  lastTile?.focus({ preventScroll: true });
}

function requestClose() {
  if (!viewer.open) return;
  const shouldGoBack = viewerEntry;
  viewerEntry = false;
  hideViewer();
  if (shouldGoBack) history.back();
}

viewerImage.addEventListener("error", () => {
  viewerImage.hidden = true;
  viewerError.hidden = false;
});

document.querySelector("#viewer-close").addEventListener("click", requestClose);
document.querySelector("#viewer-prev").addEventListener("click", () => showPhoto(currentIndex - 1));
document.querySelector("#viewer-next").addEventListener("click", () => showPhoto(currentIndex + 1));
document.querySelector("#retry-load").addEventListener("click", route);
albumBack.addEventListener("click", () => {
  const url = new URL(location.href);
  url.searchParams.delete("album");
  url.searchParams.delete("demo");
  url.hash = "";
  history.pushState({}, "", url);
  route();
});

viewer.addEventListener("cancel", (event) => {
  event.preventDefault();
  requestClose();
});

window.addEventListener("popstate", () => {
  if (viewer.open) {
    viewerEntry = false;
    hideViewer();
  } else if (grantedIds.length) {
    route();
  }
});

window.addEventListener("keydown", (event) => {
  if (!viewer.open) return;
  if (event.key === "ArrowLeft") { event.preventDefault(); showPhoto(currentIndex - 1); }
  if (event.key === "ArrowRight") { event.preventDefault(); showPhoto(currentIndex + 1); }
});

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

stage.addEventListener("pointerdown", (event) => {
  stage.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 1) {
    gesture = { x: event.clientX, y: event.clientY, panX: zoom.x, panY: zoom.y };
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gesture = { distance: distance(a, b), scale: zoom.scale };
  }
});

stage.addEventListener("pointermove", (event) => {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 2 && gesture?.distance) {
    const [a, b] = [...pointers.values()];
    zoom.scale = Math.max(1, Math.min(4, gesture.scale * distance(a, b) / gesture.distance));
    if (zoom.scale === 1) { zoom.x = 0; zoom.y = 0; }
    applyZoom();
  } else if (pointers.size === 1 && zoom.scale > 1 && gesture?.panX !== undefined) {
    zoom.x = gesture.panX + event.clientX - gesture.x;
    zoom.y = gesture.panY + event.clientY - gesture.y;
    applyZoom();
  }
});

function finishPointer(event) {
  if (!pointers.has(event.pointerId)) return;
  pointers.delete(event.pointerId);
  if (pointers.size === 0 && zoom.scale === 1 && gesture?.x !== undefined) {
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      lastTap = null;
      showPhoto(currentIndex + (dx < 0 ? 1 : -1));
      return;
    }
  }
  if (pointers.size === 0 && event.pointerType === "touch" && gesture?.x !== undefined &&
      Math.abs(event.clientX - gesture.x) < 20 && Math.abs(event.clientY - gesture.y) < 20) {
    const now = Date.now();
    if (lastTap && now - lastTap.time < 350 &&
        distance(lastTap, { x: event.clientX, y: event.clientY }) < 40) {
      toggleZoom();
      lastTap = null;
    } else {
      lastTap = { time: now, x: event.clientX, y: event.clientY };
    }
  }
  if (pointers.size === 1) {
    const remaining = [...pointers.values()][0];
    gesture = { x: remaining.x, y: remaining.y, panX: zoom.x, panY: zoom.y };
  } else if (pointers.size === 0) {
    gesture = null;
  }
}

stage.addEventListener("pointerup", finishPointer);
stage.addEventListener("pointercancel", finishPointer);
stage.addEventListener("dblclick", (event) => {
  if (event.pointerType === "touch" || matchMedia("(pointer: coarse)").matches) return;
  toggleZoom();
});

checkAccess();
