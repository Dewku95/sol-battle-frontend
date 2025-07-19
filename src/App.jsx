import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';
import '@solana/wallet-adapter-react-ui/styles.css';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

const wallets = [new PhantomWalletAdapter()];
const network = clusterApiUrl('mainnet-beta');
const GAME_WALLET = new PublicKey('46PyYtoqYPZC9yjQwpWYPTQtz9WvCzjeZPjfL1K2RXJU');

function App() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const handleJoinMatch = async () => {
    if (!publicKey) return alert("Connect wallet first");

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: GAME_WALLET,
        lamports: 0.69 * LAMPORTS_PER_SOL,
      })
    );

    try {
      const sig = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(sig, 'processed');
      alert("You're in! TX: " + sig);

      // TODO: send to backend → /joinQueue
    } catch (err) {
      console.error(err);
      alert("Payment failed");
    }
  };

  return (
    <div>
      <h1>Sol Battle Royale</h1>
      <WalletMultiButton />
      <button onClick={handleJoinMatch}>Join Match (0.69 SOL)</button>
    </div>
  );
}

function AppWrapper() {
  return (
    <ConnectionProvider endpoint={network}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default AppWrapper;
