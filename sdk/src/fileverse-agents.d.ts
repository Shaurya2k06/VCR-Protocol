declare module "@fileverse/agents" {
  export class Agent {
    constructor(config: {
      chain: "gnosis" | "sepolia";
      viemAccount: unknown;
      pimlicoAPIKey: string;
      storageProvider: unknown;
    });

    setupStorage(namespace: string): Promise<unknown>;
    create(output: string): Promise<{
      hash: string;
      fileId: bigint | number | string;
      portalAddress?: string;
    }>;
    getFile(fileId: bigint | number | string): Promise<{
      portal: string;
      namespace: string;
      metadataIpfsHash: string;
      contentIpfsHash: string;
    }>;
    update(
      fileId: bigint | number | string,
      output: string,
    ): Promise<{ hash: string }>;
  }
}

declare module "@fileverse/agents/storage/index.js" {
  export class PinataStorageProvider {
    constructor(config: {
      pinataJWT: string;
      pinataGateway: string;
    });
  }
}
