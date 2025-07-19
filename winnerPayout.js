const { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram, 
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  Keypair
} = require('@solana/web3.js');
const { clusterApiUrl } = require('@solana/web3.js');

// Configuration
const TOTAL_POT_LAMPORTS = 69 * LAMPORTS_PER_SOL; // 69 SOL total pot (100 players * 0.69 SOL each)
const PRIVATE_KEY = process.env.PRIVATE_KEY; // Your game wallet private key
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || 'mainnet-beta'; // Use 'mainnet-beta' for production

class WinnerPayout {
  constructor() {
    this.connection = new Connection(clusterApiUrl(SOLANA_NETWORK), 'confirmed');
    this.gameWallet = null;
    this.initializeGameWallet();
  }

  initializeGameWallet() {
    try {
      if (!PRIVATE_KEY) {
        throw new Error('PRIVATE_KEY environment variable is required');
      }

      // Parse the private key from environment variable
      const privateKeyArray = JSON.parse(PRIVATE_KEY);
      this.gameWallet = Keypair.fromSecretKey(Uint8Array.from(privateKeyArray));
      
      console.log('Game wallet initialized:', this.gameWallet.publicKey.toString());
    } catch (error) {
      console.error('Failed to initialize game wallet:', error);
      throw error;
    }
  }

  async payoutWinner(winnerWallet) {
    try {
      console.log(`Processing payout to winner: ${winnerWallet}`);
      
      // Validate winner wallet address
      const winnerPublicKey = new PublicKey(winnerWallet);
      
      // Check game wallet balance
      const gameWalletBalance = await this.connection.getBalance(this.gameWallet.publicKey);
      console.log(`Game wallet balance: ${gameWalletBalance / LAMPORTS_PER_SOL} SOL`);
      
      if (gameWalletBalance < TOTAL_POT_LAMPORTS) {
        throw new Error(`Insufficient funds in game wallet. Required: ${TOTAL_POT_LAMPORTS / LAMPORTS_PER_SOL} SOL, Available: ${gameWalletBalance / LAMPORTS_PER_SOL} SOL`);
      }

      // Create transfer transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.gameWallet.publicKey,
          toPubkey: winnerPublicKey,
          lamports: TOTAL_POT_LAMPORTS,
        })
      );

      // Get the latest blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.gameWallet.publicKey;

      // Sign and send the transaction using sendAndConfirmTransaction
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.gameWallet]
      );

      console.log(`Winner payout successful! Transaction signature: ${signature}`);
      console.log(`Payout amount: ${TOTAL_POT_LAMPORTS / LAMPORTS_PER_SOL} SOL`);
      
      return {
        success: true,
        signature: signature,
        amount: TOTAL_POT_LAMPORTS / LAMPORTS_PER_SOL,
        winner: winnerWallet
      };

    } catch (error) {
      console.error('Error processing winner payout:', error);
      throw error;
    }
  }

  async getGameWalletBalance() {
    try {
      const balance = await this.connection.getBalance(this.gameWallet.publicKey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error('Error getting game wallet balance:', error);
      throw error;
    }
  }

  async getWinnerTransactionHistory(winnerWallet) {
    try {
      const winnerPublicKey = new PublicKey(winnerWallet);
      const signatures = await this.connection.getSignaturesForAddress(winnerPublicKey, { limit: 10 });
      return signatures;
    } catch (error) {
      console.error('Error getting transaction history:', error);
      throw error;
    }
  }
}

 