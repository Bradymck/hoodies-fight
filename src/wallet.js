// Raw EIP-1193 calls against window.ethereum - no viem/WalletConnect
// dependency. This project has zero npm dependencies by design (no
// package.json, no build step - see vercel.json), and everything here is
// already standard on any injected wallet (MetaMask, Rabby, Coinbase
// Wallet, Brave Wallet, etc). Mobile/QR wallet support via WalletConnect
// would need a project ID from cloud.reown.com, which nobody has set up
// yet - out of scope until that exists.

const ROBINHOOD_CHAIN = {
  chainIdHex: "0x1237", // 4663
  chainName: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
  blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
};

export function hasInjectedWallet() {
  return typeof window !== "undefined" && !!window.ethereum;
}

async function ensureRobinhoodChain(provider) {
  const currentChainId = await provider.request({ method: "eth_chainId" });
  if (currentChainId === ROBINHOOD_CHAIN.chainIdHex) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ROBINHOOD_CHAIN.chainIdHex }],
    });
  } catch (err) {
    // 4902 = chain not added to this wallet yet - add it, then switch.
    if (err?.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: ROBINHOOD_CHAIN.chainIdHex,
            chainName: ROBINHOOD_CHAIN.chainName,
            nativeCurrency: ROBINHOOD_CHAIN.nativeCurrency,
            rpcUrls: ROBINHOOD_CHAIN.rpcUrls,
            blockExplorerUrls: ROBINHOOD_CHAIN.blockExplorerUrls,
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

export async function connectWallet() {
  if (!hasInjectedWallet()) {
    throw new Error("No wallet found - install MetaMask, Rabby, or another browser wallet extension.");
  }
  const provider = window.ethereum;
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (!accounts?.length) throw new Error("No account returned by wallet.");
  await ensureRobinhoodChain(provider);
  return accounts[0];
}

// Checks for an already-authorized connection without prompting -
// eth_accounts (unlike eth_requestAccounts) never shows a popup, it just
// returns whatever accounts this site already has permission for. Used to
// silently resume a previous session on reload/back-navigation instead of
// making a returning visitor click "Connect Wallet" again every time.
export async function getConnectedAccount() {
  if (!hasInjectedWallet()) return null;
  try {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    return accounts?.[0] ?? null;
  } catch {
    return null;
  }
}

export function onAccountsChanged(callback) {
  if (!hasInjectedWallet()) return () => {};
  window.ethereum.on("accountsChanged", callback);
  return () => window.ethereum.removeListener("accountsChanged", callback);
}
