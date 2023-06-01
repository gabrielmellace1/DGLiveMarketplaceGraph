const axios = require('axios');

const SUBGRAPH_ENDPOINT = 'https://api.studio.thegraph.com/query/28179/dglivemarketplacegraph/version/latest'; // replace with your actual subgraph endpoint

const fetchData = async (query) => {
  try {
    const response = await axios.post(
      SUBGRAPH_ENDPOINT,
      { query }
    );

    return response.data.data;
  } catch (error) {
    console.error(error);
  }
}

const fetchTransactions = async () => {
  const query = `
    {
      transactions(first: 5) {
        id
        timestamp
        type
        blockNumber
        buyer {
          id
        }
        recipient {
          id
        }
        seller {
          id
        }
        seller
        price
        nft {
          id
          nftAddress
          tokenId
        }

        }
      
    }`;

  const data = await fetchData(query);
  const transactions = data.transactions;

  // Modify this to loop through transactions and print nested properties
  transactions.forEach(transaction => {
    console.log('Transaction ID:', transaction.id);
    console.log('Timestamp:', transaction.timestamp);
    console.log('Type:', transaction.type);
    console.log('Block ID:', transaction.blockNumber);
    console.log('Seller ID:', transaction.seller.id);
    console.log('Price:', transaction.price);
    console.log('NFT Address:', transaction.nft.id.split("-")[0]);
    console.log('Token ID:', transaction.nft.tokenId);

    // Check if buyer exists before trying to print the ID
    if (transaction.buyer) {
      console.log('Buyer ID:', transaction.buyer.id);
    } else {
      console.log('Buyer ID: None');
    }
    // Check if buyer exists before trying to print the ID
    if (transaction.recipient) {
      console.log('recipient ID:', transaction.recipient.id);
    } else {
      console.log('recipient ID: None');
    }


    console.log('\n');  // Add a newline for readability



  });
}

// Execute the function
fetchTransactions();