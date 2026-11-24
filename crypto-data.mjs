const bytes = new TextEncoder();
const text = new TextDecoder("utf-8", { fatal: true });
const hexId = /^[a-f0-9]{32}$/;
const b64 = /^[A-Za-z0-9_-]+$/;

function encode(raw) {
  return btoa(String.fromCharCode(...new Uint8Array(raw))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decode(encoded, size) {
  if (typeof encoded !== "string" || !b64.test(encoded)) throw new Error("Invalid encrypted data");
  const input = encoded.replaceAll("-", "+").replaceAll("_", "/");
  const raw = Uint8Array.from(atob(input), (character) => character.charCodeAt(0));
  if (size !== undefined && raw.length !== size) throw new Error("Invalid encrypted data length");
  return raw;
}

export function normalizeEncryptedAccess(data) {
  if (data?.version !== 3 || !hexId.test(data.release) || !Number.isInteger(data.iterations) ||
      data.iterations < 600_000 || data.iterations > 2_000_000 ||
      !Array.isArray(data.albums) || data.albums.length > 100 ||
      data.albums.some((id) => typeof id !== "string" || !hexId.test(id)) ||
      new Set(data.albums).size !== data.albums.length ||
      !data.grants || typeof data.grants !== "object" || Array.isArray(data.grants) ||
      Object.keys(data.grants).length > 100) {
    throw new Error("Invalid guest access configuration");
  }
  decode(data.salt, 32);
  return data;
}

async function open(rawKey, envelope, context) {
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({
    name: "AES-GCM", iv: decode(envelope.nonce, 12), additionalData: bytes.encode(context), tagLength: 128,
  }, key, decode(envelope.data));
  return JSON.parse(text.decode(decrypted));
}

export async function unlockAlbums(config, passphrase) {
  const password = await crypto.subtle.importKey("raw", bytes.encode(passphrase), "PBKDF2", false, ["deriveBits"]);
  const root = new Uint8Array(await crypto.subtle.deriveBits({
    name: "PBKDF2", hash: "SHA-256", salt: decode(config.salt, 32), iterations: config.iterations,
  }, password, 256));
  let hmac;
  try {
    hmac = await crypto.subtle.importKey("raw", root, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  } finally {
    root.fill(0);
  }
  const route = encode(await crypto.subtle.sign("HMAC", hmac, bytes.encode("Picapica v3 route")));
  if (!Object.hasOwn(config.grants, route)) return null;
  const grant = config.grants[route];
  const domain = bytes.encode("Picapica v3 wrap");
  const input = new Uint8Array(domain.length + 32);
  input.set(domain);
  input.set(decode(grant.salt, 32), domain.length);
  const wrap = new Uint8Array(await crypto.subtle.sign("HMAC", hmac, input));
  let payload;
  try {
    payload = await open(wrap, grant, `picapica/v3/${config.release}/grant/${route}`);
  } finally {
    wrap.fill(0);
  }
  if (!Array.isArray(payload?.albums) || !payload.albums.length || payload.albums.length > config.albums.length ||
      payload.albums.some((item) => !item || !config.albums.includes(item.id))) {
    throw new Error("Invalid album grants");
  }
  return payload.albums.map((item) => ({ ...item, key: decode(item.key, 32) }));
}

export async function decryptAlbum(release, id, key, envelope) {
  if (!hexId.test(id) || envelope?.version !== 3 || envelope.release !== release) {
    throw new Error("The album release changed");
  }
  return open(key, envelope, `picapica/v3/${release}/album/${id}`);
}
