const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { Connection, PublicKey } = require('@solana/web3.js');
const WinnerPayout = require('./winnerPayout.js');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Game state
const matchQueue = [];
const activeGames = new Map();

// Initialize winner payout system
let winnerPayout = null;
try {
  winnerPayout = new WinnerPayout();
  console.log('Winner payout system initialized');
} catch (error) {
  console.error('Failed to initialize winner payout system:', error);
  console.log('Winner payouts will be disabled');
}

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received:', data);
      
      // Handle different message types
      switch (data.type) {
        case 'JOIN_QUEUE':
          handleJoinQueue(ws, data);
          break;
        case 'GAME_ACTION':
          handleGameAction(ws, data);
          break;
        case 'DECLARE_WINNER':
          handleDeclareWinner(ws, data);
          break;
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Match queue functionality
app.post('/joinQueue', (req, res) => {
  const { wallet } = req.body;
  
  if (!wallet) {
    return res.status(400).json({ error: 'Wallet address required' });
  }
  
  // Check if wallet is already in queue
  if (matchQueue.includes(wallet)) {
    return res.status(400).json({ error: 'Already in queue' });
  }
  
  matchQueue.push(wallet);
  console.log(`Player ${wallet} joined queue. Queue size: ${matchQueue.length}`);
  
  // Notify all connected clients about queue update
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'QUEUE_UPDATE',
        queueSize: matchQueue.length,
        players: matchQueue
      }));
    }
  });
  
  // Check if we have enough players to start a match
  if (matchQueue.length === 100) {
    startMatch();
  }
  
  res.json({ ok: true, queueSize: matchQueue.length });
});

// Start a new match
function startMatch() {
  const players = [...matchQueue];
  const gameId = `game_${Date.now()}`;
  
  // Clear the queue
  matchQueue.length = 0;
  
  // Create game state
  const gameState = {
    id: gameId,
    players: players,
    status: 'active',
    startTime: Date.now(),
    eliminated: []
  };
  
  activeGames.set(gameId, gameState);
  
  // Notify all clients that match is starting
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'START_MATCH',
        gameId: gameId,
        players: players
      }));
    }
  });
  
  console.log(`Match ${gameId} started with ${players.length} players`);
}

// Handle WebSocket join queue
function handleJoinQueue(ws, data) {
  const { wallet } = data;
  
  if (!wallet) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Wallet address required' }));
    return;
  }
  
  if (matchQueue.includes(wallet)) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Already in queue' }));
    return;
  }
  
  matchQueue.push(wallet);
  console.log(`Player ${wallet} joined queue via WebSocket. Queue size: ${matchQueue.length}`);
  
  // Notify all clients about queue update
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'QUEUE_UPDATE',
        queueSize: matchQueue.length,
        players: matchQueue
      }));
    }
  });
  
  // Check if we have enough players to start a match
  if (matchQueue.length === 100) {
    startMatch();
  }
}

// Handle game actions
function handleGameAction(ws, data) {
  const { gameId, action, player } = data;
  const game = activeGames.get(gameId);
  
  if (!game) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Game not found' }));
    return;
  }
  
  // Handle different game actions
  switch (action) {
    case 'ELIMINATE':
      if (!game.eliminated.includes(player)) {
        game.eliminated.push(player);
        console.log(`Player ${player} eliminated in game ${gameId}`);
        
        // Notify all clients about elimination
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'PLAYER_ELIMINATED',
              gameId: gameId,
              player: player,
              remainingPlayers: game.players.length - game.eliminated.length
            }));
          }
        });
        
        // Check if game is over (only one player remaining)
        if (game.players.length - game.eliminated.length === 1) {
          endGame(gameId);
        }
      }
      break;
    default:
      console.log('Unknown game action:', action);
  }
}

// Handle winner declaration from client
function handleDeclareWinner(ws, data) {
  const { gameId, winner } = data;
  const game = activeGames.get(gameId);
  
  if (!game) {
    ws.send(JSON.stringify({ type: 'ERROR', message: 'Game not found' }));
    return;
  }
  
  console.log(`Winner declared for game ${gameId}: ${winner}`);
  
  // Process winner payout
  if (winnerPayout) {
    winnerPayout.payoutWinner(winner)
      .then(result => {
        console.log('Winner payout successful:', result);
        
        // Notify all clients about successful payout
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'WINNER_PAYOUT_SUCCESS',
              gameId: gameId,
              winner: winner,
              amount: result.amount,
              signature: result.signature
            }));
          }
        });
      })
      .catch(error => {
        console.error('Winner payout failed:', error);
        
        // Notify all clients about payout failure
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'WINNER_PAYOUT_FAILED',
              gameId: gameId,
              winner: winner,
              error: error.message
            }));
          }
        });
      });
  } else {
    console.log('Winner payout system not available');
  }
}

// End a game
function endGame(gameId) {
  const game = activeGames.get(gameId);
  if (!game) return;
  
  const winner = game.players.find(player => !game.eliminated.includes(player));
  game.status = 'finished';
  game.winner = winner;
  game.endTime = Date.now();
  
  console.log(`Game ${gameId} ended. Winner: ${winner}`);
  
  // Notify all clients about game end
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'GAME_END',
        gameId: gameId,
        winner: winner,
        duration: game.endTime - game.startTime
      }));
    }
  });
  
  // Clean up game after some time
  setTimeout(() => {
    activeGames.delete(gameId);
  }, 60000); // Keep game data for 1 minute
}

// API routes
app.get('/queue', (req, res) => {
  res.json({
    queueSize: matchQueue.length,
    players: matchQueue
  });
});

app.get('/games', (req, res) => {
  const games = Array.from(activeGames.values()).map(game => ({
    id: game.id,
    playerCount: game.players.length,
    status: game.status,
    startTime: game.startTime
  }));
  res.json(games);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    queueSize: matchQueue.length,
    activeGames: activeGames.size
  });
});

// Get game wallet balance
app.get('/wallet/balance', async (req, res) => {
  try {
    if (!winnerPayout) {
      return res.status(503).json({ error: 'Winner payout system not available' });
    }
    
    const balance = await winnerPayout.getGameWalletBalance();
    res.json({ balance: balance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get payout information
app.get('/payout/info', (req, res) => {
  res.json({
    totalPot: 69, // 69 SOL
    entryFee: 0.69, // 0.69 SOL per player
    playersPerGame: 100,
    payoutSystem: winnerPayout ? 'enabled' : 'disabled'
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Battle Royale Server running on port ${PORT}`);
  console.log(`WebSocket server ready for connections`);
}); 