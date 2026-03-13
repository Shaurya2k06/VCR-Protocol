// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VCRPolicyRegistry
 * @notice On-chain supplement to the ENS-based VCR policy record.
 *         Stores IPFS CIDs of VCR policy documents keyed by ENS node hash.
 *         Allows any third party to verify policy URIs without an ENS lookup.
 *
 * @dev This contract is NOT required for VCR — ENS text records are the
 *      primary anchor. This provides an alternative on-chain lookup path.
 */
contract VCRPolicyRegistry {

    // ── Events ──────────────────────────────────────────────────────────────

    event PolicySet(
        bytes32 indexed ensNode,
        address indexed setter,
        string policyUri,
        uint256 agentId
    );

    event PolicyRevoked(
        bytes32 indexed ensNode,
        address indexed revoker
    );

    // ── State ────────────────────────────────────────────────────────────────

    struct PolicyRecord {
        string policyUri;     // ipfs://<CID>
        uint256 agentId;      // ERC-8004 agentId
        address setter;       // Address that set this record
        uint256 timestamp;    // Block timestamp when set
        bool active;          // False if revoked
    }

    /// @notice ENS node hash → latest policy record
    mapping(bytes32 => PolicyRecord) private _policies;

    /// @notice ENS node hash → full history of policy URIs
    mapping(bytes32 => PolicyRecord[]) private _policyHistory;

    /// @notice Total number of policy records stored
    uint256 public totalPolicies;

    // ── Write ─────────────────────────────────────────────────────────────────

    /**
     * @notice Set or update the VCR policy URI for an ENS name.
     * @param ensNode    The namehash of the ENS name (keccak256 of normalized name)
     * @param policyUri  IPFS URI of the VCR policy JSON (e.g. "ipfs://bafkrei...")
     * @param agentId    The ERC-8004 agent ID associated with this policy
     */
    function setPolicy(
        bytes32 ensNode,
        string calldata policyUri,
        uint256 agentId
    ) external {
        require(bytes(policyUri).length > 0, "VCR: policyUri cannot be empty");
        require(bytes(policyUri).length <= 256, "VCR: policyUri too long");

        PolicyRecord memory record = PolicyRecord({
            policyUri: policyUri,
            agentId: agentId,
            setter: msg.sender,
            timestamp: block.timestamp,
            active: true
        });

        _policies[ensNode] = record;
        _policyHistory[ensNode].push(record);
        totalPolicies++;

        emit PolicySet(ensNode, msg.sender, policyUri, agentId);
    }

    /**
     * @notice Revoke a policy. Only the original setter can revoke.
     * @param ensNode  The namehash of the ENS name
     */
    function revokePolicy(bytes32 ensNode) external {
        PolicyRecord storage record = _policies[ensNode];
        require(record.setter == msg.sender, "VCR: only setter can revoke");
        require(record.active, "VCR: policy already inactive");

        record.active = false;
        emit PolicyRevoked(ensNode, msg.sender);
    }

    // ── Read ──────────────────────────────────────────────────────────────────

    /**
     * @notice Get the current policy URI for an ENS name.
     * @return policyUri  IPFS URI, or empty string if not set / revoked
     * @return agentId    Associated ERC-8004 agent ID
     * @return active     Whether the policy is currently active
     */
    function getPolicy(bytes32 ensNode)
        external
        view
        returns (
            string memory policyUri,
            uint256 agentId,
            bool active,
            address setter,
            uint256 timestamp
        )
    {
        PolicyRecord storage record = _policies[ensNode];
        return (
            record.policyUri,
            record.agentId,
            record.active,
            record.setter,
            record.timestamp
        );
    }

    /**
     * @notice Check if a specific policy URI is the current active policy for an ENS name.
     * @dev Useful for quick on-chain verification without off-chain IPFS fetch.
     */
    function verifyPolicy(bytes32 ensNode, string calldata policyUri)
        external
        view
        returns (bool valid)
    {
        PolicyRecord storage record = _policies[ensNode];
        return record.active &&
            keccak256(bytes(record.policyUri)) == keccak256(bytes(policyUri));
    }

    /**
     * @notice Get the number of policy records ever set for an ENS name.
     */
    function getPolicyHistoryCount(bytes32 ensNode) external view returns (uint256) {
        return _policyHistory[ensNode].length;
    }

    /**
     * @notice Get a specific historical policy record by index.
     */
    function getPolicyHistoryEntry(bytes32 ensNode, uint256 index)
        external
        view
        returns (
            string memory policyUri,
            uint256 agentId,
            address setter,
            uint256 timestamp,
            bool active
        )
    {
        require(index < _policyHistory[ensNode].length, "VCR: index out of bounds");
        PolicyRecord storage record = _policyHistory[ensNode][index];
        return (record.policyUri, record.agentId, record.setter, record.timestamp, record.active);
    }
}
