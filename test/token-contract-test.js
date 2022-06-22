const { expect } = require("chai");
const { ethers } = require("hardhat");
// const { deployContract, getBlockTimestamp, mineBlockTimestamp, offsettedIndex } = require('./helpers.js');

describe("ERC721A Contract Tests", function() {
  let Contract;
  let testContract;
  let name = 'BitBots'
  let symbol = 'BITS'
  let maxBatchSize = 5
  let collectionSize = 9999
  let supplyLimitForDevs = 500
  const dayInSeconds = 24 * 60 * 60
  const currentTimeInSeconds = Math.round(Date.now() / 1000)
  let allowListSaleStartTime = currentTimeInSeconds + (7 * dayInSeconds)
  let publicSaleStartTime = currentTimeInSeconds + (14 * dayInSeconds)
  let allowListPriceEthNum = 0.04
  let allowListPriceWei = ethers.utils.parseEther(allowListPriceEthNum.toString())
  let allowListTotalSize = 2000
  let publicPriceEthNum = 0.05
  let publicPriceWei = ethers.utils.parseEther(publicPriceEthNum.toString())
  let publicSaleKey = 9876

  beforeEach(async function(){
    Contract = await ethers.getContractFactory("TokenContract");
    [owner, addr1, addr2, addr3, ...addrs] = await ethers.getSigners();

    testContract = await Contract.deploy(name, symbol, maxBatchSize, collectionSize, supplyLimitForDevs)
  })

  describe("Constructor variables are set correctly", function() {
    it("Constructor variables are set correctly", async function() {
      expect(await testContract.name()).to.equal(name)
      expect(await testContract.symbol()).to.equal(symbol)
      expect(await testContract.maxPerAddressDuringMint()).to.equal(maxBatchSize)
      expect(await testContract.collectionSize()).to.equal(collectionSize)
      expect(await testContract.supplyLimitForDevs()).to.equal(supplyLimitForDevs)
    })
  })

  describe("URI tests", function(){
    it("Owner can set URI", async function(){
      await testContract.setBaseURI('https://www.bitbot.io/')
    })

    it("Non-owner cannot set URI", async function(){
      await expect(testContract.connect(addr1).setBaseURI('https://www.bitbot.io/'))
        .to.be.revertedWith("Ownable: caller is not the owner")
    })
  })

  describe("Sales Config can be updated", function(){
    it("Owner can update sales config", async function() {
      await testContract.setSalesConfig(
        allowListSaleStartTime,
        publicSaleStartTime,
        allowListPriceWei,
        allowListTotalSize,
        publicPriceWei,
        publicSaleKey
      )

      const updatedSalesConfig = await testContract.saleConfig()

      expect(updatedSalesConfig.allowListSaleStartTime).to.equal(allowListSaleStartTime)
      expect(updatedSalesConfig.publicSaleStartTime).to.equal(publicSaleStartTime)
      expect(allowListPriceWei).to.equal(allowListPriceWei)
      expect(allowListTotalSize).to.equal(allowListTotalSize)
      expect(publicPriceWei).to.equal(publicPriceWei)
      expect(publicSaleKey).to.equal(publicSaleKey)
    })

    it("Non-owner cannot update sales config", async function(){
      await expect(
        testContract.connect(addr1).setSalesConfig(
        allowListSaleStartTime,
        publicSaleStartTime,
        allowListPriceWei,
        allowListTotalSize,
        publicPriceWei,
        publicSaleKey
      )).to.be.revertedWith("Ownable: caller is not the owner")
    })
  })

  // ALLOW LIST MINT
  describe("Allow list mint tests", function(){
    beforeEach(async function(){
      // Set sales config to pass for allow list
      allowListSaleStartTime = currentTimeInSeconds - (5*60)
      await testContract.setSalesConfig(
        allowListSaleStartTime,
        publicSaleStartTime,
        allowListPriceWei,
        allowListTotalSize,
        publicPriceWei,
        publicSaleKey
      )
      const allowListAddresses = [addr1.address, addr2.address]
      const allowListNumSlots = [1, 2]

      await testContract.seedAllowList(allowListAddresses, allowListNumSlots)
    })

    it("User on the allow list can mint their alotted number", async function(){
      await testContract.connect(addr1).allowListMint(1, {value: ethers.utils.parseEther(allowListPriceEthNum.toString())})
      await testContract.connect(addr2).allowListMint(2, {value: ethers.utils.parseEther((allowListPriceEthNum*2).toString())})
      expect(await testContract.balanceOf(addr1.address)).to.equal(1)
      expect(await testContract.balanceOf(addr2.address)).to.equal(2)
      expect(await testContract.ownerOf(0)).to.equal(addr1.address)
      expect(await testContract.ownerOf(1)).to.equal(addr2.address)
    })

    it("User on the allow list cannot mint if there is no price", async function(){
      await testContract.setSalesConfig(
        allowListSaleStartTime,
        publicSaleStartTime,
        0,
        allowListTotalSize,
        publicPriceWei,
        publicSaleKey
      )
      await expect(testContract.connect(addr1).allowListMint(1)).to.be.revertedWith("allowlist sale has not begun yet")
    })

    it("User on the allow list cannot mint the sale has not yet started", async function(){
      allowListSaleStartTime += (30*60)
      await testContract.setSalesConfig(
        allowListSaleStartTime,
        publicSaleStartTime,
        allowListPriceWei,
        allowListTotalSize,
        publicPriceWei,
        publicSaleKey
      )
      await expect(testContract.connect(addr1).allowListMint(1)).to.be.revertedWith("allow list sale has not started yet")
    })

    it("User not on allow list cannot mint using allow list mint function", async function(){
      await expect(
        testContract.connect(addr3).allowListMint(1, {value: ethers.utils.parseEther(allowListPriceEthNum.toString())})
      ).to.be.revertedWith("not eligible for this quantity of allowlist mint")
    })

    it("Allowed user cannot mint above allow list mint allotment in a single transaction", async function(){
      await expect(
        testContract.connect(addr1).allowListMint(2, {value: ethers.utils.parseEther((allowListPriceEthNum*2).toString())}))
        .to.be.revertedWith("trying to mint more than allowed")
    })

    it("Allowed user cannot mint above allow list mint allotment in a multiple transactions", async function(){
      await testContract.connect(addr1).allowListMint(1, {value: ethers.utils.parseEther(allowListPriceEthNum.toString())})
      await expect(
        testContract.connect(addr1).allowListMint(1, {value: ethers.utils.parseEther((allowListPriceEthNum).toString())}))
        .to.be.revertedWith("not eligible for this quantity of allowlist mint")
    })

    it("Allowed user cannot mint above total supply in allowlist", async function(){
      Contract = await ethers.getContractFactory("TokenContract");
      testContract = await Contract.deploy(name, symbol, maxBatchSize, 1, 1)
      await testContract.setSalesConfig(
        allowListSaleStartTime,
        publicSaleStartTime,
        allowListPriceWei,
        allowListTotalSize,
        publicPriceWei,
        publicSaleKey
      )
      const allowListAddresses = [addr1.address, addr2.address]
      const allowListNumSlots = [1, 2]
      await testContract.seedAllowList(allowListAddresses, allowListNumSlots)

      await expect(
        testContract.connect(addr2).allowListMint(2, {value: ethers.utils.parseEther((allowListPriceEthNum*2).toString())})
      ).to.be.revertedWith("reached max supply")
    })

    it("Allowed user cannot mint above total allowed in allowlist", async function(){
      await testContract.setSalesConfig(
        allowListSaleStartTime,
        publicSaleStartTime,
        allowListPriceWei,
        1,
        publicPriceWei,
        publicSaleKey
      )

      await expect(
        testContract.connect(addr2).allowListMint(2, {value: ethers.utils.parseEther((allowListPriceEthNum*2).toString())})
      ).to.be.revertedWith("reached max allowlist supply")
    })

    it("Allowed user cannot mint if msg value not equal to required", async function(){
      await expect(
        testContract.connect(addr2).allowListMint(2, {value: ethers.utils.parseEther(((allowListPriceEthNum*2)-0.01).toString())})
      ).to.be.revertedWith("Need to send more ETH.")
    })
  })

  describe("Public sale mint tests", function(){
    beforeEach(async function(){
      // Set sales config to pass for allow list
      publicSaleStartTime = currentTimeInSeconds - (5*60)
      await testContract.setSalesConfig(
        allowListSaleStartTime,
        publicSaleStartTime,
        allowListPriceWei,
        allowListTotalSize,
        publicPriceWei,
        publicSaleKey
      )
    })

    it("User can public mint if all criteria met", async function(){
      await testContract.connect(addr1).publicSaleMint(3, publicSaleKey, {value: ethers.utils.parseEther(((publicPriceEthNum*3)).toString())})
      await testContract.connect(addr2).publicSaleMint(1, publicSaleKey, {value: ethers.utils.parseEther(publicPriceEthNum.toString())})
      expect(await testContract.balanceOf(addr1.address)).to.equal(3)
      expect(await testContract.balanceOf(addr2.address)).to.equal(1)
      expect(await testContract.ownerOf(0)).to.equal(addr1.address)
      expect(await testContract.ownerOf(1)).to.equal(addr1.address)
      expect(await testContract.ownerOf(2)).to.equal(addr1.address)
      expect(await testContract.ownerOf(3)).to.equal(addr2.address)
    })

    it("User cannot mint without the correct public sale key", async function(){
      await expect(
        testContract.connect(addr1).publicSaleMint(3, publicSaleKey-1, {value: ethers.utils.parseEther(((publicPriceEthNum*3)).toString())})
      ).to.be.revertedWith("called with incorrect public sale key")
    })

    it("User cannot mint before public sale starts", async function(){
      publicSaleStartTime = currentTimeInSeconds + (5*60)
      await testContract.setSalesConfig(
        allowListSaleStartTime,
        publicSaleStartTime,
        allowListPriceWei,
        allowListTotalSize,
        publicPriceWei,
        publicSaleKey
      )
      await expect(
        testContract.connect(addr1).publicSaleMint(3, publicSaleKey, {value: ethers.utils.parseEther(((publicPriceEthNum*3)).toString())})
      ).to.be.revertedWith("public sale has not begun yet")
    })

    it("User cannot mint quantity above total supply", async function(){
      Contract = await ethers.getContractFactory("TokenContract");
      testContract = await Contract.deploy(name, symbol, maxBatchSize, 1, 1)
      await testContract.setSalesConfig(
        allowListSaleStartTime,
        publicSaleStartTime,
        allowListPriceWei,
        allowListTotalSize,
        publicPriceWei,
        publicSaleKey
      )

      await expect(
        testContract.connect(addr1).publicSaleMint(2, publicSaleKey, {value: ethers.utils.parseEther(((publicPriceEthNum*2)).toString())})
      ).to.be.revertedWith("reached max supply")
    })

    it("User cannot mint if msg value not equal to required", async function(){
      await expect(
        testContract.connect(addr2).publicSaleMint(2, publicSaleKey, {value: ethers.utils.parseEther(((allowListPriceEthNum*2)-0.01).toString())})
      ).to.be.revertedWith("Need to send more ETH.")
    })

    it("User cannot mint quantity above allowed in a single transaction", async function(){
      await expect(
        testContract.connect(addr1).publicSaleMint(6, publicSaleKey, {value: ethers.utils.parseEther(((publicPriceEthNum*6)).toString())})
      ).to.be.revertedWith("can not mint this many")
    })

    it("User cannot mint quantity above allowed in multiple transactions", async function(){
      await testContract.connect(addr1).publicSaleMint(3, publicSaleKey, {value: ethers.utils.parseEther(((publicPriceEthNum*3)).toString())})

      await expect(
        testContract.connect(addr1).publicSaleMint(3, publicSaleKey, {value: ethers.utils.parseEther(((publicPriceEthNum*3)).toString())})
      ).to.be.revertedWith("can not mint this many")
    })

    it("Owner can withdraw balance", async function(){

      const txValue = ethers.utils.parseEther(((publicPriceEthNum*3)).toString())
      await testContract.connect(addr1).publicSaleMint(3, publicSaleKey, {value: txValue})

      const tx = await testContract.withdrawMoney()
      const receipt = await tx.wait()
      const gasSpent = receipt.gasUsed.mul(receipt.effectiveGasPrice)

      expect(await testContract.withdrawMoney())
        .to.changeEtherBalance(owner, txValue);
    })

    it("Non-owner cannot withdraw balance", async function(){
      await expect(testContract.connect(addr1).withdrawMoney()).to.be.revertedWith("Ownable: caller is not the owner")
    })
  })

  describe("Dev mint tests", function(){
    it("Non-owner cannot call dev mint function", async function(){
      await expect(
        testContract.connect(addr1).devMint(addr1.address, 1)
      ).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("Owner can dev mint to another users wallet", async function(){
      await testContract.devMint(addr1.address, 1)
      expect(await testContract.ownerOf(0)).to.equal(addr1.address)
      expect(await testContract.balanceOf(addr1.address)).to.equal(1)
    })

    it("Owner can dev mint to another own wallet", async function(){
      await testContract.devMint(owner.address, 1)
      expect(await testContract.ownerOf(0)).to.equal(owner.address)
      expect(await testContract.balanceOf(owner.address)).to.equal(1)
    })

    it("Owner can dev mint to multiple NFTs", async function(){
      await testContract.devMint(owner.address, 2)
      expect(await testContract.ownerOf(0)).to.equal(owner.address)
      expect(await testContract.ownerOf(1)).to.equal(owner.address)
      expect(await testContract.balanceOf(owner.address)).to.equal(2)
    })

    it("Owner cannot mint above dev mint limit", async function(){
      Contract = await ethers.getContractFactory("TokenContract");
      testContract = await Contract.deploy(name, symbol, maxBatchSize, 2, 1)
      const [owner] = await ethers.getSigners();

      await expect(testContract.devMint(owner.address, 2)).to.be.revertedWith("too many already minted before dev mint")
    })
  })
})


