import { ethers } from 'ethers'
import { BaseProvider } from '@ethersproject/providers';
import ERC1155 from './specs/erc1155';
import ERC721 from './specs/erc721';
// import ensRegistryJSON from './abi/ENSRegistry.json'
// import publicResolverJSON from './abi/publicResolver.json'
import ensRegistryJSON from '../node_modules/@ensdomains/ens-contracts/build/contracts/ENSRegistry.json' 
import publicResolverJSON from '../node_modules/@ensdomains/ens-contracts/build/contracts/PublicResolver.json'
import {
  BaseError,
  createCacheAdapter,
  fetch,
  getImageURI,
  handleSettled,
  parseNFT,
  resolveURI,
} from './utils';
import { getNamehash } from './namehash'
import URI from './specs/uri'

export interface Spec {
  getMetadata: (
    provider: BaseProvider,
    ownerAddress: string | undefined | null,
    contractAddress: string,
    tokenID: string
  ) => Promise<any>;
}

export const specs: { [key: string]: new () => Spec } = Object.freeze({
  erc721: ERC721,
  erc1155: ERC1155,
});

export interface UnsupportedNamespace {}
export class UnsupportedNamespace extends BaseError {}

interface AvatarRequestOpts {
  jsdomWindow?: any;
}

interface AvatarResolverOpts {
  cache?: number;
  ipfs?: string;
}

export interface AvatarResolver {
  provider: BaseProvider;
  options?: AvatarResolverOpts;
  getAvatar(ens: string, data: AvatarRequestOpts): Promise<string | null>;
  getMetadata(ens: string): Promise<any | null>;
}

export class AvatarResolver implements AvatarResolver {
  constructor(provider: BaseProvider, options?: AvatarResolverOpts) {
    this.provider = provider;
    this.options = options;
    if (options?.cache && options?.cache > 0) {
      createCacheAdapter(fetch, options?.cache);
    }
  }

  async getMetadata(ens: string) {
    console.log(`this.provider: ${JSON.stringify(this.provider)}`)
    console.log(`ens: ${ens}`)
    // Normalise and hash the name
    const resolvedAddress = getNamehash(ens)
    console.log(`resolvedAddress: ${resolvedAddress}`)

    // Get the registry
    const registry = await new ethers.Contract( '0x3B02fF1e626Ed7a8fd6eC5299e2C54e1421B626B' , ensRegistryJSON , this.provider )
    const resolverAddress = await registry.resolver(resolvedAddress)
    // Get the resolver
    const resolver = await new ethers.Contract( resolverAddress , publicResolverJSON , this.provider )
    console.log(`resolver.address: ${JSON.stringify(resolver.address)}`)
    // const ensAddress = await resolver.addr(resolvedAddress)
    // console.log(`ensAddress: $(ensAddress)`)
    // Get the owners address
    // retrieve registrar address and resolver object from ens name
    // const [resolvedAddress, resolver] = await handleSettled([
    //   this.provider.resolveName(ens),
    //   this.provider.getResolver(ens),
    // ]);
    console.log(`resolver: ${JSON.stringify(resolver)}`)
    if (!resolver) return null;

    // retrieve 'avatar' text recored from resolver
    const avatarURI = await resolver.getText('avatar');
    // const avatarURI = 'http://localhost:8787/local'
    if (!avatarURI) return null;

    // test case-insensitive in case of uppercase records
    if (!/eip155:/i.test(avatarURI)) {
      const uriSpec = new URI();
      const metadata = await uriSpec.getMetadata(avatarURI);
      return { uri: ens, ...metadata };
    }

    // parse retrieved avatar uri
    const { chainID, namespace, contractAddress, tokenID } = parseNFT(
      avatarURI
    );
    // detect avatar spec by namespace
    const Spec = specs[namespace];
    if (!Spec)
      throw new UnsupportedNamespace(`Unsupported namespace: ${namespace}`);
    const spec = new Spec();

    // add meta information of the avatar record
    const host_meta = {
      chain_id: chainID,
      namespace,
      contract_address: contractAddress,
      token_id: tokenID,
      reference_url: `https://opensea.io/assets/${contractAddress}/${tokenID}`,
    };

    // retrieve metadata
    const metadata = await spec.getMetadata(
      this.provider,
      resolvedAddress,
      contractAddress,
      tokenID
    );
    return { uri: ens, host_meta, ...metadata };
  }

  async getAvatar(
    ens: string,
    data?: AvatarRequestOpts
  ): Promise<string | null> {
    console.log("Yay in linked getAvatar ")
    console.log(`ens: ${ens}`)
    // console.log(`data: ${JSON.stringify(data)}`)
    const metadata = await this.getMetadata(ens);
    console.log(`metadata: ${JSON.stringify(metadata)}`)
    if (!metadata) return null;
    return getImageURI({
      metadata,
      customGateway: this.options?.ipfs,
      jsdomWindow: data?.jsdomWindow,
    });
  }
}

export const utils = { getImageURI, parseNFT, resolveURI };
