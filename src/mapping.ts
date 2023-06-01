import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts";
import { Sell, Buy, BuyForGift, PaperPurchase, Cancel } from "../generated/DGLiveMarketplaceGraph/DGLiveMarketplace";
import { User, NFTAddress, NFT, Transaction } from "../generated/schema";

function getOrCreateUser(address: Address): User {
  let userId = address.toHex();
  let user = User.load(userId);

  if (user == null) {
    user = new User(userId);
    user.totalSales = BigInt.fromI32(0);
    user.totalRevenue = BigInt.fromI32(0);
    user.totalSpent = BigInt.fromI32(0);
    user.save();
  }

  return user as User;
}

function getOrCreateNFTAddress(nftAddress: Bytes): NFTAddress {
  let nftAddressId = nftAddress.toHex();
  let nftAddressEntity = NFTAddress.load(nftAddressId);

  if (nftAddressEntity == null) {
    nftAddressEntity = new NFTAddress(nftAddressId);
    nftAddressEntity.nftAddress = nftAddress;
    nftAddressEntity.totalSales = BigInt.fromI32(0);
    nftAddressEntity.totalRevenue = BigInt.fromI32(0);
    nftAddressEntity.save();
  }

  return nftAddressEntity as NFTAddress;
}

function getOrCreateNFT(nftAddress: Bytes, tokenId: BigInt): NFT {
  let nftId = nftAddress.toHex() + '-' + tokenId.toString();
  let nft = NFT.load(nftId);
let nftAddressEntity = getOrCreateNFTAddress(nftAddress);
  if (nft == null) {
    nft = new NFT(nftId);
    nft.nftAddress = nftAddressEntity.id;
    nft.tokenId = tokenId;
    nft.forSale = false;
    nft.currentPrice = BigInt.fromI32(0);
    nft.seller = Address.fromString("0x0000000000000000000000000000000000000000").toHex(); // Set seller to a "zero" address initially
    nft.save();
  }

  return nft as NFT;
}

export function handleSell(event: Sell): void {
  let seller = getOrCreateUser(event.params._msgSender);
  let nftAddress = getOrCreateNFTAddress(event.params._nftAddress);

  for (let i = 0; i < event.params._tokenIds.length; i++) {
    let nft = getOrCreateNFT(nftAddress.nftAddress, event.params._tokenIds[i]);

    // Update the NFT
    nft.forSale = true;
    nft.currentPrice = event.params._prices[i];
    nft.seller = seller.id;
    nft.save();

    // Create a new transaction
    let transactionId = event.transaction.hash.toHex() + '-' + i.toString();
    let transaction = new Transaction(transactionId);
    transaction.nftAddress = nftAddress.id;
    transaction.blockNumber = event.block.number;
    transaction.buyer = Address.fromString("0x0000000000000000000000000000000000000000").toHex();
    transaction.recipient = Address.fromString("0x0000000000000000000000000000000000000000").toHex();
    transaction.seller = seller.id;
    transaction.nft = nft.id;
    transaction.type = "Sell";
    transaction.timestamp = event.block.timestamp;
    transaction.price = event.params._prices[i];
    transaction.save();
  }
}


export function handleCancel(event: Cancel): void {
  // Obtain user who cancelled the sale
  let user = getOrCreateUser(event.params._msgSender);
  let nftAddress = getOrCreateNFTAddress(event.params._nftAddress);

  // Iterate over each tokenID in the array
  for (let i = 0; i < event.params._tokenIds.length; i++) {
    let tokenId = event.params._tokenIds[i];

    // Retrieve the NFT being cancelled
    let nft = getOrCreateNFT(event.params._nftAddress, tokenId);

    // Set NFT as not for sale
    nft.forSale = false;

    // Reset the current price
    nft.currentPrice = BigInt.fromI32(0);

    // Reset the seller
    nft.seller = Address.fromString("0x0000000000000000000000000000000000000000").toHex();

    // Save the updated NFT
    nft.save();

    // Create new transaction for this event
    let transaction = new Transaction(event.transaction.hash.toHex() + "-" + i.toString());
    transaction.nftAddress = nftAddress.id;
    transaction.buyer = Address.fromString("0x0000000000000000000000000000000000000000").toHex();
    transaction.seller = user.id;
    transaction.blockNumber = event.block.number;
    transaction.nft = nft.id;
    transaction.recipient = Address.fromString("0x0000000000000000000000000000000000000000").toHex();
    transaction.type = "Cancel";
    transaction.timestamp = event.block.timestamp;
    transaction.price = BigInt.fromI32(0);; // No price associated with a cancel transaction

    // Save the transaction
    transaction.save();
  }
}

export function handleBuy(event: Buy): void {
  let buyer = getOrCreateUser(event.params._msgSender);
  let nftAddress = getOrCreateNFTAddress(event.params._nftAddress);

  for (let i = 0; i < event.params._tokenIds.length; i++) {
    let nft = getOrCreateNFT(event.params._nftAddress, event.params._tokenIds[i]);
    let seller = getOrCreateUser(event.params.beneficiaries[i]);
    

 // Create a new transaction
let transaction = new Transaction(event.transaction.hash.toHex() + '-' + i.toString());
transaction.nftAddress = nftAddress.id; // Use the id of the NFTAddress entity
transaction.buyer = buyer.id;
transaction.seller = seller.id;
transaction.nft = nft.id;
transaction.blockNumber = event.block.number;
transaction.recipient = buyer.id; // Set the recipient of the gift
transaction.type = "Buy";
transaction.timestamp = event.block.timestamp;
transaction.price = nft.currentPrice;
transaction.save();


    // Update the buyer and seller's data
    buyer.totalSpent = buyer.totalSpent.plus(nft.currentPrice);
    buyer.save();

    seller.totalSales = seller.totalSales.plus(BigInt.fromI32(1));
    seller.totalRevenue = seller.totalRevenue.plus(nft.currentPrice);
    seller.save();

    // Update the NFTAddress's data
    
    nftAddress.totalSales = nftAddress.totalSales.plus(BigInt.fromI32(1));
    nftAddress.totalRevenue = nftAddress.totalRevenue.plus(nft.currentPrice);
    nftAddress.save();

    // Update the NFT
    nft.forSale = false;
    nft.seller = Address.fromString("0x0000000000000000000000000000000000000000").toHex(); // Reset the seller to the "zero" address
    nft.currentPrice = BigInt.fromI32(0); // Reset the price
    nft.save();
  }
}
export function handleBuyForGift(event: BuyForGift): void {
  let buyer = getOrCreateUser(event.params._msgSender);
  let recipient = getOrCreateUser(event.params._transferTo); // Get or create the gift recipient
  let nftAddress = getOrCreateNFTAddress(event.params._nftAddress);

  for (let i = 0; i < event.params._tokenIds.length; i++) {
    let nft = getOrCreateNFT(event.params._nftAddress, event.params._tokenIds[i]);
    let seller = getOrCreateUser(event.params.beneficiaries[i]);
    
    // Create a new transaction
    let transaction = new Transaction(event.transaction.hash.toHex() + '-' + i.toString());
    transaction.nftAddress = nftAddress.id;
    transaction.buyer = buyer.id;
    transaction.seller = seller.id;
    transaction.nft = nft.id;
    transaction.blockNumber = event.block.number;
    transaction.recipient = recipient.id; // Set the recipient of the gift
    transaction.type = "BuyForGift";
    transaction.timestamp = event.block.timestamp;
    transaction.price = nft.currentPrice;
    transaction.save();

    // Update the buyer and seller's data
    buyer.totalSpent = buyer.totalSpent.plus(nft.currentPrice);
    buyer.save();

    seller.totalSales = seller.totalSales.plus(BigInt.fromI32(1));
    seller.totalRevenue = seller.totalRevenue.plus(nft.currentPrice);
    seller.save();

    // Update the NFTAddress's data
    nftAddress.totalSales = nftAddress.totalSales.plus(BigInt.fromI32(1));
    nftAddress.totalRevenue = nftAddress.totalRevenue.plus(nft.currentPrice);
    nftAddress.save();

    // Update the NFT
    nft.forSale = false;
    nft.seller = Address.fromString("0x0000000000000000000000000000000000000000").toHex(); // Reset the seller to the "zero" address
    nft.currentPrice = BigInt.fromI32(0); // Reset the price
    nft.save();
  }
}
export function handlePaperPurchase(event: PaperPurchase): void {
  let beneficiary = getOrCreateUser(event.params._transferTo);
  let nftAddress = getOrCreateNFTAddress(event.params._nftAddress);
  let nft = getOrCreateNFT(event.params._nftAddress, event.params._tokenId);
  let seller = getOrCreateUser(event.params.beneficiary);
  
  // Create a new transaction
  let transaction = new Transaction(event.transaction.hash.toHex());
  transaction.nftAddress = nftAddress.id;
  transaction.recipient = beneficiary.id; // Set the recipient of the NFT
  transaction.buyer = Address.fromString("0x0000000000000000000000000000000000000000").toHex();
  transaction.seller = seller.id;
  transaction.nft = nft.id;
  transaction.blockNumber = event.block.number;
  transaction.type = "PaperPurchase"; 
  transaction.timestamp = event.block.timestamp;
  transaction.price = nft.currentPrice;
  transaction.save();

  // Update the seller's data
  seller.totalSales = seller.totalSales.plus(BigInt.fromI32(1));
  seller.totalRevenue = seller.totalRevenue.plus(nft.currentPrice);
  seller.save();

  // Update the NFTAddress's data
  nftAddress.totalSales = nftAddress.totalSales.plus(BigInt.fromI32(1));
  nftAddress.totalRevenue = nftAddress.totalRevenue.plus(nft.currentPrice);
  nftAddress.save();

  // Update the NFT
  nft.forSale = false;
  nft.seller = Address.fromString("0x0000000000000000000000000000000000000000").toHex(); // Reset the seller to the "zero" address
  nft.currentPrice = BigInt.fromI32(0); // Reset the price
  nft.save();
}
