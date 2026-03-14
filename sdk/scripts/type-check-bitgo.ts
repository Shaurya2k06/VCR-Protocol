import { BitGoAPI } from "@bitgo/sdk-api";
type GenerateWalletParams = Parameters<ReturnType<BitGoAPI["coin"]>["wallets"]["generateWallet"]>[0];
let p: GenerateWalletParams = null as any;
p.somethingShouldFailHereToPrintTypes;
