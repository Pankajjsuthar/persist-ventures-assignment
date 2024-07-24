import express from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import rateLimit from 'express-rate-limit';
import fs from 'fs/promises';
import path from 'path';

const app = express();
const port = 3000;

const createConnectionWithRetry = async (url, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const connection = new Connection(url, 'confirmed');
      await connection.getLatestBlockhash();
      console.log('Connected to Solana network');
      return connection;
    } catch (error) {
      console.error(`Connection attempt ${i + 1} failed:`, error.message);
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
};

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

app.use(limiter);

let connection;

app.get('/transactions/:address', async (req, res) => {
  try {
    if (!connection) {
      connection = await createConnectionWithRetry('https://api.mainnet-beta.solana.com');
    }

    const address = new PublicKey(req.params.address);
    
    const signatures = await connection.getSignaturesForAddress(address, { limit: 10 });
    
    const transactions = await Promise.all(
      signatures.map(async (sig) => {
        try {
          return await connection.getTransaction(sig.signature);
        } catch (error) {
          console.error(`Error fetching transaction ${sig.signature}:`, error.message);
          return null;
        }
      })
    );
    
    const validTransactions = transactions.filter(tx => tx !== null);
    
    // Create a filename with the wallet address and current timestamp
    const filename = `${address.toString()}_${Date.now()}.json`;
    
    // Ensure the 'responses' directory exists
    await fs.mkdir('responses', { recursive: true });
    
    // Write the response to a file
    await fs.writeFile(
      path.join('responses', filename),
      JSON.stringify(validTransactions, null, 2)
    );
    
    res.json({
      message: `Transactions saved to file: ${filename}`,
      transactions: validTransactions
    });
  } catch (error) {
    console.error('Error fetching transactions:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:3000`);
});