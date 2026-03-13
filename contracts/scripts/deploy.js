const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying VCRPolicyRegistry with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH");

  const VCRPolicyRegistry = await hre.ethers.getContractFactory(
    "VCRPolicyRegistry"
  );
  const registry = await VCRPolicyRegistry.deploy();
  await registry.waitForDeployment();
  console.log("Registry addr: ", await registry.getAddress());

  const address = await registry.getAddress();
  console.log("\n✅ VCRPolicyRegistry deployed to:", address);
  console.log("   Network:", hre.network.name);
  console.log("   Block:", await hre.ethers.provider.getBlockNumber());
  console.log("\nVerify on Etherscan:");
  console.log(`   npx hardhat verify --network ${hre.network.name} ${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
