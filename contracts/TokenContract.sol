pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "erc721a/contracts/ERC721A.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract TokenContract is Ownable, ERC721A, ReentrancyGuard {
  using Strings for string;
  using SafeMath for uint256;

  uint256 public immutable collectionSize;
  uint256 public immutable maxPerAddressDuringMint;
  uint256 public immutable supplyLimitForDevs;

  struct SaleConfig {
    uint32 allowListSaleStartTime;
    uint32 publicSaleStartTime;
    uint64 allowListPriceWei;
    uint32 allowListTotalSize;
    uint64 publicPrice;
    uint32 publicSaleKey;
  }

  SaleConfig public saleConfig;

  mapping(address => uint256) public allowlist;

  constructor(
    string memory _name,
    string memory _symbol,
    uint256 _maxBatchSize,
    uint256 _collectionSize,
    uint256 _supplyLimitForDevs
  ) ERC721A(_name, _symbol) {
    maxPerAddressDuringMint = _maxBatchSize;
    require(
      _supplyLimitForDevs <= _collectionSize,
      "larger collection size needed"
    );
    supplyLimitForDevs = _supplyLimitForDevs;
    collectionSize = _collectionSize;
  }

  modifier callerIsUser() {
    require(tx.origin == msg.sender, "The caller is another contract");
    _;
  }

  //  allowlist time controlled by price existing
  function allowListMint(uint256 quantity) external payable callerIsUser {
    SaleConfig memory config = saleConfig;
    uint256 price = uint256(config.allowListPriceWei);
    require(price != 0, "allowlist sale has not begun yet");

    uint256 _saleStartTime = uint256(config.allowListSaleStartTime);
    require(
      _saleStartTime != 0 && block.timestamp >= _saleStartTime,
      "allow list sale has not started yet"
    );
    uint256 totalSupplyWithQuantity = totalSupply() + quantity;
    require(allowlist[msg.sender] > 0, "not eligible for this quantity of allowlist mint");

    // remove if not required to cap allow list total quantity
    require(totalSupplyWithQuantity <= config.allowListTotalSize, "reached max allowlist supply");
    require(totalSupplyWithQuantity <= collectionSize, "reached max supply");

    require(
      numberMinted(msg.sender) + quantity <= allowlist[msg.sender],
        "trying to mint more than allowed"
    );

    allowlist[msg.sender] -= quantity;
    _safeMint(msg.sender, quantity);

    refundIfOver(price * quantity);
  }

  function publicSaleMint(uint256 quantity, uint256 callerPublicSaleKey)
  external
  payable
  callerIsUser
  {
    SaleConfig memory config = saleConfig;
    uint256 publicSaleKey = uint256(config.publicSaleKey);
    uint256 publicPrice = uint256(config.publicPrice);
    uint256 publicSaleStartTime = uint256(config.publicSaleStartTime);
    require(
      publicSaleKey == callerPublicSaleKey,
      "called with incorrect public sale key"
    );

    require(
      isPublicSaleOn(publicPrice, publicSaleKey, publicSaleStartTime),
      "public sale has not begun yet"
    );
    require(totalSupply() + quantity <= collectionSize, "reached max supply");
    require(
      numberMinted(msg.sender) + quantity <= maxPerAddressDuringMint,
      "can not mint this many"
    );

    _safeMint(msg.sender, quantity);
    refundIfOver(publicPrice * quantity);
  }

  function refundIfOver(uint256 price) private {
    require(msg.value >= price, "Need to send more ETH.");
    if (msg.value > price) {
      payable(msg.sender).transfer(msg.value - price);
    }
  }

  function isPublicSaleOn(
    uint256 publicPriceWei,
    uint256 publicSaleKey,
    uint256 publicSaleStartTime
  ) public view returns (bool) {
    return
    publicPriceWei != 0 &&
    publicSaleKey != 0 &&
    block.timestamp >= publicSaleStartTime;
  }

  function setSalesConfig(
    uint32 allowListSaleStartTime,
    uint32 publicSaleStartTime,
    uint64 allowListPriceWei,
    uint32 allowListTotalSize,
    uint64 publicPriceWei,
    uint32 publicSaleKey
  ) external onlyOwner {
    saleConfig = SaleConfig(
      allowListSaleStartTime,
      publicSaleStartTime,
      allowListPriceWei,
      allowListTotalSize,
      publicPriceWei,
      publicSaleKey
    );
  }

  function seedAllowList(address[] memory addresses, uint256[] memory numSlots)
  external
  onlyOwner
  {
    require(
      addresses.length == numSlots.length,
      "addresses does not match numSlots length"
    );
    for (uint256 i = 0; i < addresses.length; i++) {
      allowlist[addresses[i]] = numSlots[i];
    }
  }

  function devMint(address mintToAddress, uint256 quantity) external onlyOwner {
    require(
      totalSupply() + quantity <= supplyLimitForDevs,
      "too many already minted before dev mint"
    );
    _safeMint(mintToAddress, quantity);
  }

  // // metadata URI
  string private _baseTokenURI;

  function _baseURI() internal view virtual override returns (string memory) {
    return _baseTokenURI;
  }

  function setBaseURI(string calldata baseURI) external onlyOwner {
    _baseTokenURI = baseURI;
  }


  function withdrawMoney() external onlyOwner nonReentrant {
    (bool success, ) = msg.sender.call{value: address(this).balance}("");
    require(success, "Transfer failed.");
  }

  function numberMinted(address owner) public view returns (uint256) {
    return _numberMinted(owner);
  }
}
