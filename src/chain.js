// Direct on-chain fallback for when api.onchainhoodies.xyz is fully down,
// not just slow. Raw JSON-RPC eth_call against Robinhood Chain - no viem,
// this project has zero npm dependencies by design (see wallet.js for the
// same reasoning). The collection is fully on-chain (its own API reports
// fullyOnChain: true), so ownerOf/tokenURI work independent of their
// server entirely - this only depends on Robinhood Chain's own RPC being
// up, which is Robinhood's infrastructure, not a small NFT project's.
//
// Chain ID 4663 / RPC / explorer confirmed directly against Robinhood
// Chain's own Blockscout API (queried the OnChainHoodies contract there
// and got back a verified, non-scam ERC-721), not guessed.

const RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
const CONTRACT = "0x9ec6c5b9f572a9b02138e553bc5f5882da735f45";

const SELECTOR_OWNER_OF = "6352211e"; // ownerOf(uint256)
const SELECTOR_TOKEN_URI = "c87b56dd"; // tokenURI(uint256)

function encodeUint256(tokenId) {
  return BigInt(tokenId).toString(16).padStart(64, "0");
}

async function ethCall(selector, tokenId) {
  const data = `0x${selector}${encodeUint256(tokenId)}`;
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: CONTRACT, data }, "latest"],
    }),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message ?? "eth_call failed");
  return body.result; // 0x-prefixed hex
}

// ABI-decodes a single `address` return value - right-aligned in the last
// 20 bytes of one 32-byte word.
function decodeAddress(hex) {
  const clean = hex.replace(/^0x/, "");
  return `0x${clean.slice(-40)}`;
}

// ABI-decodes a single dynamic `string` return value: 32-byte offset
// (ignored, always 0x20 for a lone return value), 32-byte length, then the
// UTF-8 bytes themselves padded to a 32-byte boundary.
function decodeString(hex) {
  const clean = hex.replace(/^0x/, "");
  const lengthHex = clean.slice(64, 128);
  const length = parseInt(lengthHex, 16);
  const dataHex = clean.slice(128, 128 + length * 2);
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = parseInt(dataHex.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

export async function readOwnerOf(tokenId) {
  const result = await ethCall(SELECTOR_OWNER_OF, tokenId);
  return decodeAddress(result);
}

export async function readTokenURI(tokenId) {
  const result = await ethCall(SELECTOR_TOKEN_URI, tokenId);
  return decodeString(result);
}

function parseTokenURI(uri) {
  if (uri.startsWith("data:application/json;base64,")) {
    const json = atob(uri.slice("data:application/json;base64,".length));
    return JSON.parse(json);
  }
  if (uri.startsWith("data:application/json,")) {
    return JSON.parse(decodeURIComponent(uri.slice("data:application/json,".length)));
  }
  // A plain HTTP(S) URI, presumably under their own domain - if their API
  // server is down this will likely fail too, but it's still worth trying
  // since a metadata host and the REST API aren't necessarily the same
  // service under the hood.
  return fetch(uri).then((r) => r.json());
}

// Best-effort on-chain equivalent of api.js's fetchToken(). NOT a full
// drop-in: rarity "tier" (Common/Rare/etc) is something their own indexer
// computes across the whole collection, not data any single token's
// on-chain metadata can contain - that field comes back undefined here,
// and loadFighterData's rareTraitCount will land on 0 rather than guess.
// Field names below follow the standard OpenSea metadata schema
// (name/image/attributes) since that's what fully-on-chain generative
// contracts (this one's an EIP-1167 clone of Mintbay's generative
// implementation) conventionally emit - not independently confirmed
// against a live decoded sample, since the API being down is exactly the
// scenario this function exists for.
export async function fetchTokenOnChain(tokenId) {
  const uri = await readTokenURI(tokenId);
  const metadata = await parseTokenURI(uri);
  const attrs = {};
  for (const attr of metadata.attributes ?? []) {
    if (attr?.trait_type) attrs[attr.trait_type.toLowerCase()] = { value: attr.value };
  }
  return {
    token: { name: metadata.name ?? `OnChainHoodies #${tokenId}` },
    // Confirmed against a live decoded token: the on-chain JSON puts the
    // SVG under `image_data` (already a full data: URI, not a bare URL) -
    // OpenSea's own on-chain-art convention reserves plain `image` for an
    // externally hosted URL, which this fully-on-chain contract has none of.
    image: { svg: metadata.image_data ?? metadata.image ?? "" },
    traits: {
      hoodie: attrs.hoodie?.value ?? attrs.hoodietype?.value ?? "Builder",
      dress: attrs.dress ?? null,
      mouth: attrs.mouth ?? null,
      top: attrs.top ?? null,
      eyes: attrs.eyes ?? null,
    },
  };
}
