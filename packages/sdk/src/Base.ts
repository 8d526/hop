import { Signer, providers, BigNumber } from 'ethers'
import { Chain, Token } from './models'
import { TChain, TProvider, TToken } from './types'
import { addresses, chains, metadata, bonders } from './config'

/**
 * Class with base methods.
 * @namespace Base
 */
class Base {
  /** Network name */
  public network: string

  /** Ethers signer or provider */
  public signer: TProvider

  /**
   * @desc Instantiates Base class.
   * Returns a new Base class instance.
   * @param {String} network - L1 network name (e.g. 'mainnet', 'kovan', 'goerli')
   * @returns {Object} New Base class instance.
   */
  constructor (network: string, signer: TProvider) {
    if (!this.isValidNetwork(network)) {
      throw new Error(
        `network is unsupported. Supported networks are: ${this.supportedNetworks.join(
          ','
        )}`
      )
    }
    this.network = network
    if (signer) {
      this.signer = signer
    }
  }

  get supportedNetworks () {
    return Object.keys(chains)
  }

  isValidNetwork (network: string) {
    return this.supportedNetworks.includes(network)
  }

  get supportedChains () {
    return Object.keys(chains[this.network])
  }

  isValidChain (chain: string) {
    return this.supportedChains.includes(chain)
  }

  /**
   * @desc Returns a Chain model instance with connected provider.
   * @param {Object} - Chain name or model.
   * @returns {Object} - Chain model with connected provider.
   */
  public toChainModel (chain: TChain) {
    if (typeof chain === 'string') {
      chain = Chain.fromSlug(chain)
    }
    if (!this.isValidChain(chain.slug)) {
      throw new Error(
        `chain "${
          chain.slug
        }" is unsupported. Supported chains are: ${this.supportedChains.join(
          ','
        )}`
      )
    }

    chain.provider = this.getChainProvider(chain)
    chain.chainId = this.getChainId(chain)
    return chain
  }

  /**
   * @desc Returns a Token instance.
   * @param {Object} - Token name or model.
   * @returns {Object} - Token model.
   */
  public toTokenModel (token: TToken) {
    if (typeof token === 'string') {
      let { name, symbol, decimals } = metadata.tokens[this.network][token]
      return new Token(0, '', decimals, symbol, name)
    }

    return token
  }

  /**
   * @desc Calculates current gas price plus increased percentage amount.
   * @param {Object} - Ether's Signer
   * @param {number} - Percentage to bump by.
   * @returns {BigNumber} Bumped as price as BigNumber
   * @example
   *```js
   *import { Hop } from '@hop-protocol/sdk'
   *
   *const hop = new Hop()
   *const bumpedGasPrice = await hop.getBumpedGasPrice(signer, 1.20)
   *console.log(bumpedGasPrice.toNumber())
   *```
   */
  public async getBumpedGasPrice (signer: TProvider, percent: number) {
    const gasPrice = await signer.getGasPrice()
    return gasPrice.mul(BigNumber.from(percent * 100)).div(BigNumber.from(100))
  }

  /**
   * @desc Returns Chain ID for specified Chain model.
   * @param {Object} - Chain model.
   * @returns {Number} - Chain ID.
   */
  public getChainId (chain: Chain) {
    const { chainId } = chains[this.network][chain.slug]
    return Number(chainId)
  }

  /**
   * @desc Returns Ethers provider for specified Chain model.
   * @param {Object} - Chain model.
   * @returns {Object} - Ethers provider.
   */
  public getChainProvider (chain: Chain) {
    const { rpcUrl } = chains[this.network][chain.slug]
    return new providers.StaticJsonRpcProvider(rpcUrl)
  }

  /**
   * @desc Returns the connected signer address.
   * @returns {String} Ethers signer address.
   * @example
   *```js
   *import { Hop } from '@hop-protocol/sdk'
   *
   *const hop = new Hop()
   *const address = await hop.getSignerAddress()
   *console.log(address)
   *```
   */
  public async getSignerAddress () {
    if (!this.signer) {
      throw new Error('signer not connected')
    }
    return (this.signer as Signer)?.getAddress()
  }

  /**
   * @desc Returns the connected signer if it's connected to the specified
   * chain id, otherwise it returns a regular provider.
   * @param {Object} chain - Chain name or model
   * @param {Object} signer - Ethers signer or provider
   * @returns {Object} Ethers signer or provider
   */
  public async getSignerOrProvider (
    chain: TChain,
    signer: TProvider = this.signer as Signer
  ) {
    chain = this.toChainModel(chain)
    if (!signer) {
      return chain.provider
    }
    if (!(signer as Signer)?.provider) {
      return (signer as Signer)?.connect(chain.provider)
    }
    const connectedChainId = await (signer as Signer)?.getChainId()
    if (connectedChainId !== chain.chainId) {
      return chain.provider
    }
    return signer
  }

  public getConfigAddresses (token: TToken, chain: TChain) {
    token = this.toTokenModel(token)
    chain = this.toChainModel(chain)
    return addresses[this.network]?.[token.symbol]?.[chain.slug]
  }

  public getL1BridgeAddress (token: TToken, chain: TChain) {
    return this.getConfigAddresses(token, chain)?.l1Bridge
  }

  public getL2BridgeAddress (token: TToken, chain: TChain) {
    return this.getConfigAddresses(token, chain)?.l2Bridge
  }

  public getL1CanonicalBridgeAddress (token: TToken, chain: TChain) {
    return this.getConfigAddresses(token, chain)?.l1CanonicalBridge
  }

  public getL2CanonicalBridgeAddress (token: TToken, chain: TChain) {
    return this.getConfigAddresses(token, chain)?.l2CanonicalBridge
  }

  public getL1CanonicalTokenAddress (token: TToken, chain: TChain) {
    return this.getConfigAddresses(token, chain)?.l1CanonicalToken
  }

  public getL2CanonicalTokenAddress (token: TToken, chain: TChain) {
    return this.getConfigAddresses(token, chain)?.l2CanonicalToken
  }

  public getL2HopBridgeTokenAddress (token: TToken, chain: TChain) {
    return this.getConfigAddresses(token, chain)?.l2HopBridgeToken
  }

  public getL2AmmWrapperAddress (token: TToken, chain: TChain) {
    return this.getConfigAddresses(token, chain)?.l2AmmWrapper
  }

  public getL2SaddleSwapAddress (token: TToken, chain: TChain) {
    return this.getConfigAddresses(token, chain)?.l2SaddleSwap
  }

  public getL2SaddleLpTokenAddress (token: TToken, chain: TChain) {
    return this.getConfigAddresses(token, chain)?.l2SaddleLpToken
  }

  // Arbitrum ARB Chain address
  public getArbChainAddress (token: TToken, chain: TChain) {
    return this.getConfigAddresses(token, chain)?.arbChain
  }

  // xDai L1 Home AMB bridge address
  public getL1AmbBridgeAddress (token: TToken, chain: TChain) {
    return this.getConfigAddresses(token, chain)?.l1Amb
  }

  // xDai L2 AMB bridge address
  public getL2AmbBridgeAddress (token: TToken, chain: TChain) {
    return this.getConfigAddresses(token, chain)?.l2Amb
  }

  // Polygon Root Chain Manager address
  public getL1PosRootChainManagerAddress (token: TToken, chain: TChain) {
    return this.getConfigAddresses(token, chain)?.l1PosRootChainManager
  }

  // Polygon ERC20 Predicate address
  public getL1PosErc20PredicateAddress (token: TToken, chain: TChain) {
    return this.getConfigAddresses(token, chain)?.l1PosPredicate
  }

  // Transaction overrides options
  public txOverrides (chain: Chain) {
    const txOptions: any = {}
    if (chain.equals(Chain.Optimism)) {
      txOptions.gasPrice = 0
      txOptions.gasLimit = 8000000
    } else if (chain.equals(Chain.xDai)) {
      txOptions.gasLimit = 5000000
    }
    return txOptions
  }

  public getBonderAddress (): string {
    return bonders?.[this.network]?.[0]
  }
}

export default Base