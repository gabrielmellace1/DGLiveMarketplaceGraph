import { BigInt, Address, Bytes } from "@graphprotocol/graph-ts";
import {
  Sell,
  Buy,
  BuyForGift,
  PaperPurchase,
  Cancel,
} from "../generated/DGLiveMarketplaceGraph/DGLiveMarketplace";
import {
  User,
  NFTAddress,
  NFT,
  Transaction,
  UserTransaction,
  DateEntity,
  UserSale,
  NFTAddressSale,
  TransactionCounter,
} from "../generated/schema";

export function timestampToDate(timestamp: number): string {
  let unixTimestamp = timestamp;
  let days = Math.floor(unixTimestamp / 86400);

  let year = 1970;
  let month = 1;

  while (true) {
    let leapYear =
      year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) ? 1 : 0;
    let daysInYear = 365 + leapYear;
    if (days < daysInYear) {
      break;
    }
    days -= daysInYear;
    year++;
  }

  for (; month <= 12; month++) {
    let leapYear =
      year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) ? 1 : 0;
    let daysInMonth =
      31 - (((month - 1) % 7) % 2) - (month == 2 ? 2 - leapYear : 0);
    if (days < daysInMonth) {
      break;
    }
    days -= daysInMonth;
  }

  // Day, month and year are now correct.
  let day = days + 1;

  // Formatting the month and day to always have two digits
  let monthString = month < 10 ? "0" + month.toString() : month.toString();
  let dayString = day < 10 ? "0" + day.toString() : day.toString();

  return year.toString() + "-" + monthString + "-" + dayString;
}

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
  let nftId = nftAddress.toHex() + "-" + tokenId.toString();
  let nft = NFT.load(nftId);
  let nftAddressEntity = getOrCreateNFTAddress(nftAddress);
  if (nft == null) {
    nft = new NFT(nftId);
    nft.nftAddress = nftAddressEntity.id;
    nft.tokenId = tokenId;
    nft.forSale = false;
    nft.currentPrice = BigInt.fromI32(0);
    nft.seller = Address.fromString(
      "0x0000000000000000000000000000000000000000"
    ).toHex(); // Set seller to a "zero" address initially
    nft.save();
  }

  return nft as NFT;
}

function getOrCreateDateEntity(date: string): DateEntity {
  let dateEntity = DateEntity.load(date);

  if (dateEntity == null) {
    dateEntity = new DateEntity(date);
    dateEntity.day = BigInt.fromString(date.substring(8, 10)).toI32();
    dateEntity.month = BigInt.fromString(date.substring(5, 7)).toI32();
    dateEntity.year = BigInt.fromString(date.substring(0, 4)).toI32();

    dateEntity.save();
  }

  return dateEntity as DateEntity;
}

function getOrCreateUserSales(userId: string, date: string): UserSale {
  let userSalesId = userId + "-" + date;
  let userSales = UserSale.load(userSalesId);

  if (userSales == null) {
    userSales = new UserSale(userSalesId);
    userSales.user = userId;
    let dateEntity = getOrCreateDateEntity(date);
    userSales.date = dateEntity.id;
    userSales.totalSales = BigInt.fromI32(0);
    userSales.totalRevenue = BigInt.fromI32(0);
    userSales.save();
  }

  return userSales as UserSale;
}

function getOrCreateNftAddressSales(
  nftAddressId: string,
  date: string
): NFTAddressSale {
  let nftAddressSalesId = nftAddressId + "-" + date;
  let nftAddressSales = NFTAddressSale.load(nftAddressSalesId);

  if (nftAddressSales == null) {
    nftAddressSales = new NFTAddressSale(nftAddressSalesId);
    nftAddressSales.nftAddress = nftAddressId;
    let dateEntity = getOrCreateDateEntity(date);
    nftAddressSales.date = dateEntity.id;
    nftAddressSales.totalSales = BigInt.fromI32(0);
    nftAddressSales.totalRevenue = BigInt.fromI32(0);
    nftAddressSales.save();
  }

  return nftAddressSales as NFTAddressSale;
}

function incrementTransactionCounter(): void {
  // Retrieve TransactionCounter, assuming its ID is "global" (since you only need one instance)
  let transactionCounter = TransactionCounter.load("global");

  // If TransactionCounter doesn't exist yet, create it
  if (transactionCounter == null) {
    transactionCounter = new TransactionCounter("global");
    transactionCounter.count = BigInt.fromI32(0); // Initialize count to 0
  }

  // Increment the transaction counter
  transactionCounter.count = transactionCounter.count.plus(BigInt.fromI32(1));

  // Save TransactionCounter
  transactionCounter.save();
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
    let transactionId = event.transaction.hash.toHex() + "-" + i.toString();
    let transaction = new Transaction(transactionId);
    transaction.hash = event.transaction.hash.toHex();
    transaction.nftAddress = nftAddress.id;
    transaction.blockNumber = event.block.number;
    transaction.buyer = Address.fromString(
      "0x0000000000000000000000000000000000000000"
    ).toHex();
    transaction.recipient = Address.fromString(
      "0x0000000000000000000000000000000000000000"
    ).toHex();
    transaction.seller = seller.id;
    transaction.nft = nft.id;
    transaction.type = "Sell";
    transaction.timestamp = event.block.timestamp;
    transaction.price = event.params._prices[i];
    transaction.save();

    incrementTransactionCounter();

    let userTransactionId = seller.id + "-" + transactionId;
    let userTransaction = new UserTransaction(userTransactionId);
    userTransaction.user = seller.id;
    userTransaction.action = "List";
    userTransaction.hash = event.transaction.hash.toHex();
    userTransaction.nftAddress = nftAddress.id;
    userTransaction.nft = nft.id;
    userTransaction.price = event.params._prices[i];
    userTransaction.timestamp = event.block.timestamp;
    userTransaction.save();
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
    nft.seller = Address.fromString(
      "0x0000000000000000000000000000000000000000"
    ).toHex();

    // Save the updated NFT
    nft.save();

    // Create new transaction for this event
    let transactionId = event.transaction.hash.toHex() + "-" + i.toString();
    let transaction = new Transaction(transactionId);
    transaction.nftAddress = nftAddress.id;
    transaction.buyer = Address.fromString(
      "0x0000000000000000000000000000000000000000"
    ).toHex();
    transaction.hash = event.transaction.hash.toHex();
    transaction.seller = user.id;
    transaction.blockNumber = event.block.number;
    transaction.nft = nft.id;
    transaction.recipient = Address.fromString(
      "0x0000000000000000000000000000000000000000"
    ).toHex();
    transaction.type = "Cancel";
    transaction.timestamp = event.block.timestamp;
    transaction.price = BigInt.fromI32(0); // No price associated with a cancel transaction

    // Save the transaction
    transaction.save();

    incrementTransactionCounter();

    let userTransactionId = user.id + "-" + transactionId;
    let userTransaction = new UserTransaction(userTransactionId);
    userTransaction.user = user.id;
    userTransaction.action = "Delist";
    userTransaction.hash = event.transaction.hash.toHex();
    userTransaction.nftAddress = nftAddress.id;
    userTransaction.nft = nft.id;
    userTransaction.price = BigInt.fromI32(0);
    userTransaction.timestamp = event.block.timestamp;
    userTransaction.save();
  }
}

export function handleBuy(event: Buy): void {
  let buyer = getOrCreateUser(event.params._msgSender);
  let nftAddress = getOrCreateNFTAddress(event.params._nftAddress);
  let dateString = timestampToDate(event.block.timestamp.toI32());

  for (let i = 0; i < event.params._tokenIds.length; i++) {
    let nft = getOrCreateNFT(
      event.params._nftAddress,
      event.params._tokenIds[i]
    );
    let seller = getOrCreateUser(event.params.beneficiaries[i]);

    // Create a new transaction
    let transactionId = event.transaction.hash.toHex() + "-" + i.toString();
    let transaction = new Transaction(transactionId);
    transaction.nftAddress = nftAddress.id; // Use the id of the NFTAddress entity
    transaction.buyer = buyer.id;
    transaction.hash = event.transaction.hash.toHex();
    transaction.seller = seller.id;
    transaction.nft = nft.id;
    transaction.blockNumber = event.block.number;
    transaction.recipient = buyer.id; // Set the recipient of the gift
    transaction.type = "Buy";
    transaction.timestamp = event.block.timestamp;
    transaction.price = nft.currentPrice;
    transaction.save();

    incrementTransactionCounter();

    // Add transaction for the buyer
    let buyerTransactionId = buyer.id + "-" + transactionId;
    let buyerTransaction = new UserTransaction(buyerTransactionId);
    buyerTransaction.user = buyer.id;
    buyerTransaction.action = "Purchase";
    buyerTransaction.hash = event.transaction.hash.toHex();
    buyerTransaction.nftAddress = nftAddress.id;
    buyerTransaction.nft = nft.id;
    buyerTransaction.price = nft.currentPrice;
    buyerTransaction.timestamp = event.block.timestamp;
    buyerTransaction.save();

    // Add transaction for the seller
    let sellerTransactionId = seller.id + "-" + transactionId;
    let sellerTransaction = new UserTransaction(sellerTransactionId);
    sellerTransaction.user = seller.id;
    sellerTransaction.action = "Sale";
    sellerTransaction.hash = event.transaction.hash.toHex();
    sellerTransaction.nftAddress = nftAddress.id;
    sellerTransaction.nft = nft.id;
    sellerTransaction.price = nft.currentPrice;
    sellerTransaction.timestamp = event.block.timestamp;
    sellerTransaction.save();

    // Get or create UserSales for the seller and update it
    let sellerSales = getOrCreateUserSales(seller.id, dateString);
    sellerSales.totalSales = sellerSales.totalSales.plus(BigInt.fromI32(1));
    sellerSales.totalRevenue = sellerSales.totalRevenue.plus(nft.currentPrice);
    sellerSales.save();

    // Get or create NFTAddressSales for the NFT address and update it
    let nftAddressSales = getOrCreateNftAddressSales(nftAddress.id, dateString);
    nftAddressSales.totalSales = nftAddressSales.totalSales.plus(
      BigInt.fromI32(1)
    );
    nftAddressSales.totalRevenue = nftAddressSales.totalRevenue.plus(
      nft.currentPrice
    );
    nftAddressSales.save();

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
    nft.seller = Address.fromString(
      "0x0000000000000000000000000000000000000000"
    ).toHex(); // Reset the seller to the "zero" address
    nft.currentPrice = BigInt.fromI32(0); // Reset the price
    nft.save();
  }
}
export function handleBuyForGift(event: BuyForGift): void {
  let buyer = getOrCreateUser(event.params._msgSender);
  let recipient = getOrCreateUser(event.params._transferTo); // Get or create the gift recipient
  let nftAddress = getOrCreateNFTAddress(event.params._nftAddress);

  let dateString = timestampToDate(event.block.timestamp.toI32());

  for (let i = 0; i < event.params._tokenIds.length; i++) {
    let nft = getOrCreateNFT(
      event.params._nftAddress,
      event.params._tokenIds[i]
    );
    let seller = getOrCreateUser(event.params.beneficiaries[i]);

    // Create a new transaction
    let transactionId = event.transaction.hash.toHex() + "-" + i.toString();
    let transaction = new Transaction(transactionId);
    transaction.hash = event.transaction.hash.toHex();
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

    incrementTransactionCounter();

    // Add transaction for the buyer
    let buyerTransactionId = buyer.id + "-" + transactionId;
    let buyerTransaction = new UserTransaction(buyerTransactionId);
    buyerTransaction.user = buyer.id;
    buyerTransaction.action = "Purchase for gift";
    buyerTransaction.hash = event.transaction.hash.toHex();
    buyerTransaction.nftAddress = nftAddress.id;
    buyerTransaction.nft = nft.id;
    buyerTransaction.price = nft.currentPrice;
    buyerTransaction.timestamp = event.block.timestamp;
    buyerTransaction.save();

    // Add transaction for the seller
    let sellerTransactionId = seller.id + "-" + transactionId;
    let sellerTransaction = new UserTransaction(sellerTransactionId);
    sellerTransaction.user = seller.id;
    sellerTransaction.action = "Sale";
    sellerTransaction.hash = event.transaction.hash.toHex();
    sellerTransaction.nftAddress = nftAddress.id;
    sellerTransaction.nft = nft.id;
    sellerTransaction.price = nft.currentPrice;
    sellerTransaction.timestamp = event.block.timestamp;
    sellerTransaction.save();

    // Add transaction for the recipient
    let recipientTransactionId = recipient.id + "-" + transactionId;
    let recipientTransaction = new UserTransaction(recipientTransactionId);
    recipientTransaction.user = recipient.id;
    recipientTransaction.action = "Gift received";
    recipientTransaction.hash = event.transaction.hash.toHex();
    recipientTransaction.nftAddress = nftAddress.id;
    recipientTransaction.nft = nft.id;
    recipientTransaction.price = nft.currentPrice;
    recipientTransaction.timestamp = event.block.timestamp;
    recipientTransaction.save();

    // Get or create UserSales for the seller and update it
    let sellerSales = getOrCreateUserSales(seller.id, dateString);
    sellerSales.totalSales = sellerSales.totalSales.plus(BigInt.fromI32(1));
    sellerSales.totalRevenue = sellerSales.totalRevenue.plus(nft.currentPrice);
    sellerSales.save();

    // Get or create NFTAddressSales for the NFT address and update it
    let nftAddressSales = getOrCreateNftAddressSales(nftAddress.id, dateString);
    nftAddressSales.totalSales = nftAddressSales.totalSales.plus(
      BigInt.fromI32(1)
    );
    nftAddressSales.totalRevenue = nftAddressSales.totalRevenue.plus(
      nft.currentPrice
    );
    nftAddressSales.save();

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
    nft.seller = Address.fromString(
      "0x0000000000000000000000000000000000000000"
    ).toHex(); // Reset the seller to the "zero" address
    nft.currentPrice = BigInt.fromI32(0); // Reset the price
    nft.save();
  }
}
export function handlePaperPurchase(event: PaperPurchase): void {
  let beneficiary = getOrCreateUser(event.params._transferTo);
  let nftAddress = getOrCreateNFTAddress(event.params._nftAddress);
  let nft = getOrCreateNFT(event.params._nftAddress, event.params._tokenId);
  let seller = getOrCreateUser(event.params.beneficiary);
  let dateString = timestampToDate(event.block.timestamp.toI32());

  // Create a new transaction
  let transactionId = event.transaction.hash.toHex();
  let transaction = new Transaction(transactionId);
  transaction.hash = event.transaction.hash.toHex();
  transaction.nftAddress = nftAddress.id;
  transaction.recipient = beneficiary.id; // Set the recipient of the NFT
  transaction.buyer = beneficiary.id;
  transaction.seller = seller.id;
  transaction.nft = nft.id;
  transaction.blockNumber = event.block.number;
  transaction.type = "PaperPurchase";
  transaction.timestamp = event.block.timestamp;
  transaction.price = nft.currentPrice;
  transaction.save();

  incrementTransactionCounter();

  // Add transaction for the buyer
  let buyerTransactionId = beneficiary.id + "-" + transactionId;
  let buyerTransaction = new UserTransaction(buyerTransactionId);
  buyerTransaction.user = beneficiary.id;
  buyerTransaction.action = "Purchase";
  buyerTransaction.hash = event.transaction.hash.toHex();
  buyerTransaction.nftAddress = nftAddress.id;
  buyerTransaction.nft = nft.id;
  buyerTransaction.price = nft.currentPrice;
  buyerTransaction.timestamp = event.block.timestamp;
  buyerTransaction.save();

  // Add transaction for the seller
  let sellerTransactionId = seller.id + "-" + transactionId;
  let sellerTransaction = new UserTransaction(sellerTransactionId);
  sellerTransaction.user = seller.id;
  sellerTransaction.action = "Sale";
  sellerTransaction.hash = event.transaction.hash.toHex();
  sellerTransaction.nftAddress = nftAddress.id;
  sellerTransaction.nft = nft.id;
  sellerTransaction.price = nft.currentPrice;
  sellerTransaction.timestamp = event.block.timestamp;
  sellerTransaction.save();

  // Get or create UserSales for the seller and update it
  let sellerSales = getOrCreateUserSales(seller.id, dateString);
  sellerSales.totalSales = sellerSales.totalSales.plus(BigInt.fromI32(1));
  sellerSales.totalRevenue = sellerSales.totalRevenue.plus(nft.currentPrice);
  sellerSales.save();

  // Get or create NFTAddressSales for the NFT address and update it
  let nftAddressSales = getOrCreateNftAddressSales(nftAddress.id, dateString);
  nftAddressSales.totalSales = nftAddressSales.totalSales.plus(
    BigInt.fromI32(1)
  );
  nftAddressSales.totalRevenue = nftAddressSales.totalRevenue.plus(
    nft.currentPrice
  );
  nftAddressSales.save();

  // Update the buyer and seller's data
  beneficiary.totalSpent = beneficiary.totalSpent.plus(nft.currentPrice);
  beneficiary.save();

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
  nft.seller = Address.fromString(
    "0x0000000000000000000000000000000000000000"
  ).toHex(); // Reset the seller to the "zero" address
  nft.currentPrice = BigInt.fromI32(0); // Reset the price
  nft.save();
}
