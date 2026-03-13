const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  try {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying with:", deployer.address);
    console.log("Network:", hre.network.name);

    // Deploy Lock
    console.log("\nDeploying Lock...");
    const Lock = await hre.ethers.getContractFactory("Lock");
    const lock = await Lock.deploy();
    await lock.waitForDeployment();
    const lockAddress = await lock.getAddress();
    console.log("Lock deployed to:", lockAddress);
    const abi = JSON.parse(lock.interface.formatJson());
    // Save deployment info
    const deploymentInfo = {
      network: hre.network.name,
      deployer: deployer.address,
      deploymentTime: new Date().toISOString(),
      contracts: {
        lock: {
          address: lockAddress,
          unlockTime: unlockTime,
          abi: abi,
          unlockTimeReadable: new Date(unlockTime * 1000).toISOString()
        }
      }
    };
    console.log("\nDeployment info:", deploymentInfo);
    console.log("Dirname: ", __dirname);
    const deploymentPath = path.join(__dirname, "..", "deployment.json");
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    console.log("\nSaved deployment info to:", deploymentPath);

    console.log("\nDone.");
    console.log("Lock:", lockAddress);
  } catch (error) {
    console.error("Deployment failed:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });