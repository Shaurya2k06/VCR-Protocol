const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VCRPolicyRegistry", function () {
    let registry;
    let owner, other;

    // ENS namehash for "vcr.eth" — a deterministic bytes32
    const ENS_NODE = ethers.namehash("vcr.eth");
    const POLICY_URI = "ipfs://bafkreiexample1234567890abcdef";
    const AGENT_ID = 42;

    beforeEach(async function () {
        [owner, other] = await ethers.getSigners();
        const Factory = await ethers.getContractFactory("VCRPolicyRegistry");
        registry = await Factory.deploy();
        await registry.waitForDeployment();
    });

    // ─── Deployment ──────────────────────────────────────────────────────────

    describe("Deployment", function () {
        it("should start with zero totalPolicies", async function () {
            expect(await registry.totalPolicies()).to.equal(0n);
        });

        it("should return empty policy for unset node", async function () {
            const [policyUri, agentId, active, setter, timestamp] =
                await registry.getPolicy(ENS_NODE);
            expect(policyUri).to.equal("");
            expect(agentId).to.equal(0n);
            expect(active).to.equal(false);
            expect(setter).to.equal(ethers.ZeroAddress);
        });
    });

    // ─── setPolicy ───────────────────────────────────────────────────────────

    describe("setPolicy", function () {
        it("should set a policy and emit PolicySet event", async function () {
            await expect(registry.setPolicy(ENS_NODE, POLICY_URI, AGENT_ID))
                .to.emit(registry, "PolicySet")
                .withArgs(ENS_NODE, owner.address, POLICY_URI, AGENT_ID);
        });

        it("should store the policy correctly", async function () {
            await registry.setPolicy(ENS_NODE, POLICY_URI, AGENT_ID);
            const [policyUri, agentId, active, setter] =
                await registry.getPolicy(ENS_NODE);
            expect(policyUri).to.equal(POLICY_URI);
            expect(agentId).to.equal(BigInt(AGENT_ID));
            expect(active).to.equal(true);
            expect(setter).to.equal(owner.address);
        });

        it("should increment totalPolicies", async function () {
            await registry.setPolicy(ENS_NODE, POLICY_URI, AGENT_ID);
            expect(await registry.totalPolicies()).to.equal(1n);
        });

        it("should reject empty policyUri", async function () {
            await expect(
                registry.setPolicy(ENS_NODE, "", AGENT_ID)
            ).to.be.revertedWith("VCR: policyUri cannot be empty");
        });

        it("should reject policyUri longer than 256 bytes", async function () {
            const longUri = "ipfs://" + "a".repeat(260);
            await expect(
                registry.setPolicy(ENS_NODE, longUri, AGENT_ID)
            ).to.be.revertedWith("VCR: policyUri too long");
        });

        it("should allow different accounts to set policies for different nodes", async function () {
            const node2 = ethers.namehash("agent2.eth");
            await registry.setPolicy(ENS_NODE, POLICY_URI, AGENT_ID);
            await registry.connect(other).setPolicy(node2, "ipfs://other", 99);
            expect(await registry.totalPolicies()).to.equal(2n);
        });

        it("should allow overwriting a policy", async function () {
            await registry.setPolicy(ENS_NODE, POLICY_URI, AGENT_ID);
            const newUri = "ipfs://bafkreiupdated9999999";
            await registry.setPolicy(ENS_NODE, newUri, 100);

            const [policyUri, agentId, active] = await registry.getPolicy(ENS_NODE);
            expect(policyUri).to.equal(newUri);
            expect(agentId).to.equal(100n);
            expect(active).to.equal(true);
            expect(await registry.totalPolicies()).to.equal(2n); // Two records total
        });
    });

    // ─── revokePolicy ────────────────────────────────────────────────────────

    describe("revokePolicy", function () {
        it("should revoke a policy and emit PolicyRevoked", async function () {
            await registry.setPolicy(ENS_NODE, POLICY_URI, AGENT_ID);
            await expect(registry.revokePolicy(ENS_NODE))
                .to.emit(registry, "PolicyRevoked")
                .withArgs(ENS_NODE, owner.address);

            const [, , active] = await registry.getPolicy(ENS_NODE);
            expect(active).to.equal(false);
        });

        it("should prevent non-setter from revoking", async function () {
            await registry.setPolicy(ENS_NODE, POLICY_URI, AGENT_ID);
            await expect(
                registry.connect(other).revokePolicy(ENS_NODE)
            ).to.be.revertedWith("VCR: only setter can revoke");
        });

        it("should prevent double revocation", async function () {
            await registry.setPolicy(ENS_NODE, POLICY_URI, AGENT_ID);
            await registry.revokePolicy(ENS_NODE);
            await expect(registry.revokePolicy(ENS_NODE)).to.be.revertedWith(
                "VCR: policy already inactive"
            );
        });
    });

    // ─── verifyPolicy ────────────────────────────────────────────────────────

    describe("verifyPolicy", function () {
        it("should verify matching active policy", async function () {
            await registry.setPolicy(ENS_NODE, POLICY_URI, AGENT_ID);
            expect(await registry.verifyPolicy(ENS_NODE, POLICY_URI)).to.equal(true);
        });

        it("should reject wrong policyUri", async function () {
            await registry.setPolicy(ENS_NODE, POLICY_URI, AGENT_ID);
            expect(await registry.verifyPolicy(ENS_NODE, "ipfs://wrong")).to.equal(
                false
            );
        });

        it("should reject revoked policy", async function () {
            await registry.setPolicy(ENS_NODE, POLICY_URI, AGENT_ID);
            await registry.revokePolicy(ENS_NODE);
            expect(await registry.verifyPolicy(ENS_NODE, POLICY_URI)).to.equal(false);
        });

        it("should reject unset policy", async function () {
            expect(await registry.verifyPolicy(ENS_NODE, POLICY_URI)).to.equal(false);
        });
    });

    // ─── Policy History ──────────────────────────────────────────────────────

    describe("Policy History", function () {
        it("should track policy history count", async function () {
            expect(await registry.getPolicyHistoryCount(ENS_NODE)).to.equal(0n);
            await registry.setPolicy(ENS_NODE, POLICY_URI, AGENT_ID);
            expect(await registry.getPolicyHistoryCount(ENS_NODE)).to.equal(1n);
            await registry.setPolicy(ENS_NODE, "ipfs://updated", 100);
            expect(await registry.getPolicyHistoryCount(ENS_NODE)).to.equal(2n);
        });

        it("should return correct history entries", async function () {
            await registry.setPolicy(ENS_NODE, POLICY_URI, AGENT_ID);
            const [policyUri, agentId, setter, , active] =
                await registry.getPolicyHistoryEntry(ENS_NODE, 0);
            expect(policyUri).to.equal(POLICY_URI);
            expect(agentId).to.equal(BigInt(AGENT_ID));
            expect(setter).to.equal(owner.address);
            expect(active).to.equal(true);
        });

        it("should revert on out-of-bounds index", async function () {
            await expect(
                registry.getPolicyHistoryEntry(ENS_NODE, 0)
            ).to.be.revertedWith("VCR: index out of bounds");
        });
    });
});
