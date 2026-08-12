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

async function fetchTransparentHeadDataUri(svgUrl) {
  const res = await fetch(svgUrl);
  const svgText = await res.text();
  const transparent = stripSvgBackground(svgText);
  return `data:image/svg+xml;base64,${btoa(transparent)}`;
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
