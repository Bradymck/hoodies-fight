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

export async function loadFighterData(tokenId) {
  const [token, talk] = await Promise.all([
    fetchToken(tokenId),
    fetchHoodTalk(tokenId),
  ]);
  return {
    tokenId,
    name: token.token.name,
    hoodieType: token.traits.hoodie,
    imageUrl: token.image.svg,
    taunt: talk,
  };
}
