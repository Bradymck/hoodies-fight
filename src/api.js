const BASE = "https://api.onchainhoodies.xyz/v1";

export async function fetchToken(tokenId) {
  const res = await fetch(`${BASE}/token/${tokenId}`);
  if (!res.ok) throw new Error(`Hoodie #${tokenId} not found`);
  return res.json();
}

export async function fetchHoodTalk(tokenId) {
  try {
    const res = await fetch(`${BASE}/token/${tokenId}/hood-talk`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.talk?.text ?? data?.text ?? null;
  } catch {
    return null;
  }
}

// Every Hoodie SVG opens with a <g><rect x="0" y="0" width="20" height="20"/></g>
// full-canvas fill as its background layer. Stripping that one element gives a
// transparent head for free instead of paying per-image background removal.
function stripSvgBackground(svgText) {
  return svgText.replace(
    /<g fill="[^"]*" fill-opacity="1"><rect x="0" y="0" width="20" height="20"\/><\/g>/,
    "",
  );
}

function loadImageAsync(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// The source art is a bust (head + shoulders), not just a head, so pasting
// it whole onto a fighter's neck duplicates shoulder pixels against the
// body sprite's own shoulders. Rasterize it and clip to a home-plate shape:
// full width for the face, tapering to a point lower down so a bit of neck
// survives but the shoulder corners are cut away.
async function cropToHeadShape(svgDataUri) {
  const img = await loadImageAsync(svgDataUri);
  const size = 200;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, size, size);

  const neckY = size * 0.62;
  const bottomY = size * 0.85;
  const centerX = size / 2;
  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(size, 0);
  ctx.lineTo(size, neckY);
  ctx.lineTo(centerX, bottomY);
  ctx.lineTo(0, neckY);
  ctx.closePath();
  ctx.fill();

  return canvas.toDataURL("image/png");
}

async function fetchTransparentHeadDataUri(svgUrl) {
  const res = await fetch(svgUrl);
  const svgText = await res.text();
  const transparent = stripSvgBackground(svgText);
  const svgDataUri = `data:image/svg+xml;base64,${btoa(transparent)}`;
  return cropToHeadShape(svgDataUri);
}

export async function loadFighterData(tokenId) {
  const [token, talk] = await Promise.all([
    fetchToken(tokenId),
    fetchHoodTalk(tokenId),
  ]);
  const imageUrl = await fetchTransparentHeadDataUri(token.image.svg);
  const { hoodie, dress, mouth, top, eyes } = token.traits;
  const rareTraitCount = [dress, mouth, top, eyes].filter(
    (t) => t?.tier === "Rare",
  ).length;
  return {
    tokenId,
    name: token.token.name,
    hoodieType: hoodie,
    rareTraitCount,
    imageUrl,
    taunt: talk,
  };
}
