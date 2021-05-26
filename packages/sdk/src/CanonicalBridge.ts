import { ethers, Contract } from 'ethers'
import { formatUnits } from 'ethers/lib/utils'
import {
  arbErc20Abi,
  l1xDaiForeignOmniBridgeAbi,
  l1HomeAmbNativeToErc20,
  l1OptimismTokenBridgeAbi,
  arbitrumGlobalInboxAbi,
  l2OptimismTokenBridgeAbi,
  l2xDaiTokenAbi,
  l1PolygonPosRootChainManagerAbi,
  l2PolygonChildErc20Abi
} from '@hop-protocol/abi'
import { Chain } from './models'
import { TChain, TToken, TAmount, TProvider } from './types'
import TokenClass from './Token'
import Base from './Base'

/**
 * Class reprensenting Canonical Token Bridge.
 * @namespace CanonicalBridge
 */
class CanonicalBridge extends Base {
  /** Chain model */
  public chain: Chain

  /** Token class instance */
  public token: TokenClass

  /**
   * @desc Instantiates Canonical Token Bridge.
   * Returns a new Canonical Token Bridge instance.
   * @param {String} network - L1 network name (e.g. 'mainnet', 'kovan', 'goerli')
   * @param {Object} signer - Ethers `Signer` for signing transactions.
   * @param {Object} token - Token symbol or model
   * @param {Object} chain - Chain model
   * @returns {Object} CanonicalBridge SDK instance.
   * @example
   *```js
   *import { CanonicalHop, Chain, Token } from '@hop-protocol/sdk'
   *import { Wallet } from 'ethers'
   *
   *const signer = new Wallet(privateKey)
   *const bridge = new CanonicalBridge('kovan', signer, Token.USDC, Chain.Optimism)
   *```
   */
  constructor (
    network: string,
    signer: TProvider,
    token: TToken,
    chain?: TChain
  ) {
    super(network, signer)
    if (!token) {
      throw new Error('token symbol is required')
    }
    token = this.toTokenModel(token)
    chain = this.toChainModel(chain)
    if (signer) {
      this.signer = signer
    }
    if (chain) {
      this.chain = chain
    }

    this.token = new TokenClass(
      this.network,
      token.chainId,
      token.address,
      token.decimals,
      token.symbol,
      token.name,
      signer
    )
  }

  /**
   * @desc Return address of L1 canonical token bridge.
   * @return {String} L1 canonical token bridge address
   */
  public get address () {
    if (!this.token) {
      return null
    }
    if (!this.chain) {
      return null
    }
    return this.getL1CanonicalBridgeAddress(this.token, this.chain)
  }

  /**
   * @desc Returns canonical bridge instance with signer connected. Used for adding or changing signer.
   * @param {Object} signer - Ethers `Signer` for signing transactions.
   * @returns {Object} New CanonicalBridge SDK instance with connected signer.
   */
  public connect (signer: TProvider) {
    return new CanonicalBridge(this.network, signer, this.token, this.chain)
  }

  public getDepositApprovalAddress (chain?: TChain): string {
    chain = this.chain || this.toChainModel(chain)
    let spender = this.getL1CanonicalBridgeAddress(this.token, chain)
    if (chain.equals(Chain.Polygon)) {
      spender = this.getL1PosErc20PredicateAddress(this.token, chain)
    }
    return spender
  }

  /**
   * @desc Sends transaction to approve tokens for canonical token bridge deposit.
   * Will only send approval transaction if necessary.
   * @param {Object} amount - Token amount to approve.
   * @param {Object} chain - Chain model.
   * @returns {Object} Ethers transaction object.
   */
  public async approveDeposit (amount: TAmount, chain?: TChain) {
    amount = amount.toString()
    if (chain) {
      chain = this.toChainModel(chain)
    } else {
      chain = this.chain
    }
    const provider = await this.getSignerOrProvider(Chain.Ethereum)
    const token = this.token.connect(provider)
    const spender = this.getDepositApprovalAddress(chain)
    if (!spender) {
      throw new Error(
        `token "${this.token.symbol}" on chain "${chain.slug}" is unsupported`
      )
    }
    return token.approve(Chain.Ethereum, spender, amount)
  }

  /**
   * @desc Sends transaction to canonical token bridge to deposit tokens into L2.
   * @param {Object} amount - Token amount to deposit.
   * @param {Object} chain - Chain model.
   * @returns {Object} Ethers transaction object.
   */
  public async deposit (amount: TAmount, chain?: TChain) {
    amount = amount.toString()
    if (chain) {
      chain = this.toChainModel(chain)
    } else {
      chain = this.chain
    }
    if (!chain) {
      throw new Error('chain is required')
    }

    const recipient = await this.getSignerAddress()
    const bridgeAddress = this.getL1CanonicalBridgeAddress(this.token, chain)
    if (!bridgeAddress) {
      throw new Error(
        `token "${this.token.symbol}" on chain "${chain.slug}" is unsupported`
      )
    }
    const provider = await this.getSignerOrProvider(Chain.Ethereum)
    const tokenAddress = this.getL1CanonicalTokenAddress(
      this.token,
      Chain.Ethereum
    )
    if (!tokenAddress) {
      throw new Error(
        `token "${this.token.symbol}" on chain "${chain.slug}" is unsupported`
      )
    }

    if ((chain as Chain).equals(Chain.xDai)) {
      const bridge = new Contract(
        bridgeAddress,
        l1xDaiForeignOmniBridgeAbi,
        provider
      )
      //await this.checkMaxTokensAllowed(chain, bridge, amount)
      return bridge.relayTokens(tokenAddress, recipient, amount, {
        // xDai requires a higher gas limit
        gasLimit: 240000
      })
    } else if ((chain as Chain).equals(Chain.Optimism)) {
      const l2TokenAddress = this.getL2CanonicalTokenAddress(this.token, chain)
      if (!l2TokenAddress) {
        throw new Error(
          `token "${this.token.symbol}" on chain "${chain.slug}" is unsupported`
        )
      }
      const bridge = new Contract(
        bridgeAddress,
        l1OptimismTokenBridgeAbi,
        provider
      )
      await this.checkMaxTokensAllowed(chain, bridge, amount)
      return bridge.deposit(tokenAddress, l2TokenAddress, recipient, amount)
    } else if ((chain as Chain).equals(Chain.Arbitrum)) {
      const arbChain = this.getArbChainAddress(this.token, chain)
      const bridge = new Contract(
        bridgeAddress,
        arbitrumGlobalInboxAbi,
        provider
      )
      await this.checkMaxTokensAllowed(chain, bridge, amount)
      return bridge.depositERC20Message(
        arbChain,
        tokenAddress,
        recipient,
        amount
      )
    } else if ((chain as Chain).equals(Chain.Polygon)) {
      const bridgeAddress = this.getL1PosRootChainManagerAddress(
        this.token,
        chain
      )
      if (!bridgeAddress) {
        throw new Error(
          `token "${this.token.symbol}" on chain "${chain.slug}" is unsupported`
        )
      }
      const bridge = new Contract(
        bridgeAddress,
        l1PolygonPosRootChainManagerAbi,
        provider
      )
      const coder = ethers.utils.defaultAbiCoder
      const payload = coder.encode(['uint256'], [amount])
      return bridge.depositFor(recipient, tokenAddress, payload)
    } else {
      throw new Error('not implemented')
    }
  }

  public getWithdrawApprovalAddress (chain?: TChain): string {
    chain = this.chain || this.toChainModel(chain)
    let spender = this.getL2CanonicalBridgeAddress(this.token, chain)
    if (chain.equals(Chain.Polygon)) {
      spender = this.getL1PosErc20PredicateAddress(this.token, chain)
    }
    return spender
  }

  /**
   * @desc Sends transaction to approve tokens for canonical token bridge withdrawal.
   * Will only send approval transaction if necessary.
   * @param {Object} amount - Token amount to approve.
   * @param {Object} chain - Chain model.
   * @returns {Object} Ethers transaction object.
   */
  public async approveWithdraw (amount: TAmount, chain?: TChain) {
    amount = amount.toString()
    if (chain) {
      chain = this.toChainModel(chain)
    } else {
      chain = this.chain
    }
    // no approval needed
    if (chain.equals(Chain.Polygon)) {
      return
    }
    const provider = await this.getSignerOrProvider(Chain.Ethereum)
    const token = this.token.connect(provider)
    const spender = this.getWithdrawApprovalAddress(chain)
    if (!spender) {
      throw new Error(
        `token "${this.token.symbol}" on chain "${chain.slug}" is unsupported`
      )
    }
    return token.approve(chain, spender, amount)
  }

  /**
   * @desc Sends transaction to L2 canonical token bridge to withdraw tokens into L1.
   * @param {Object} amount - Token amount to withdraw.
   * @param {Object} chain - Chain model.
   * @returns {Object} Ethers transaction object.
   */
  public async withdraw (amount: TAmount, chain?: TChain) {
    amount = amount.toString()
    if (chain) {
      chain = this.toChainModel(chain)
    } else {
      chain = this.chain
    }
    if (!chain) {
      throw new Error('chain is required')
    }

    const recipient = await this.getSignerAddress()
    const provider = await this.getSignerOrProvider(chain)
    if ((chain as Chain).equals(Chain.xDai)) {
      const bridgeAddress = this.getL2CanonicalBridgeAddress(this.token, chain)
      if (!bridgeAddress) {
        throw new Error(
          `token "${this.token.symbol}" on chain "${chain.slug}" is unsupported`
        )
      }
      const tokenAddress = this.getL2CanonicalTokenAddress(this.token, chain)
      if (!tokenAddress) {
        throw new Error(
          `token "${this.token.symbol}" on chain "${chain.slug}" is unsupported`
        )
      }
      const bridge = new Contract(tokenAddress, l2xDaiTokenAbi, provider)
      return bridge.transferAndCall(bridgeAddress, amount, '0x', {
        // xDai requires a higher gas limit
        gasLimit: 400000
      })
    } else if ((chain as Chain).equals(Chain.Optimism)) {
      const bridgeAddress = this.getL2CanonicalBridgeAddress(this.token, chain)
      if (!bridgeAddress) {
        throw new Error(
          `token "${this.token.symbol}" on chain "${chain.slug}" is unsupported`
        )
      }
      const l1TokenAddress = this.getL1CanonicalTokenAddress(
        this.token,
        Chain.Ethereum
      )
      if (!l1TokenAddress) {
        throw new Error(
          `token "${this.token.symbol}" on chain "${Chain.Ethereum.slug}" is unsupported`
        )
      }
      const tokenAddress = this.getL2CanonicalTokenAddress(this.token, chain)
      if (!tokenAddress) {
        throw new Error(
          `token "${this.token.symbol}" on chain "${chain.slug}" is unsupported`
        )
      }
      const bridge = new Contract(
        bridgeAddress,
        l2OptimismTokenBridgeAbi,
        provider
      )

      return bridge.withdraw(l1TokenAddress, tokenAddress, amount, {
        // optimism requires a high gas limit and 0 gas price
        gasLimit: 1000000,
        gasPrice: 0
      })
    } else if ((chain as Chain).equals(Chain.Arbitrum)) {
      const bridgeAddress = this.getL2CanonicalTokenAddress(this.token, chain)
      if (!bridgeAddress) {
        throw new Error(
          `token "${this.token.symbol}" on chain "${chain.slug}" is unsupported`
        )
      }
      const bridge = new Contract(bridgeAddress, arbErc20Abi, provider)
      return bridge.withdraw(recipient, amount)
    } else if ((chain as Chain).equals(Chain.Polygon)) {
      const tokenAddress = this.getL2CanonicalTokenAddress(this.token, chain)
      if (!tokenAddress) {
        throw new Error(
          `token "${this.token.symbol}" on chain "${chain.slug}" is unsupported`
        )
      }
      const token = new Contract(tokenAddress, l2PolygonChildErc20Abi, provider)
      return token.withdraw(amount)
    } else {
      throw new Error('not implemented')
    }
  }

  /**
   * @desc Sends transaction to finalize withdrawal.
   * This call is necessary on Polygon to finalize L2 withdrawal into L1 on
   * certain chains. Will only send transaction if necessary.
   * @param {String} txHash - Transaction hash proving token burn on L2.
   * @param {Object} chain - Chain model.
   * @returns {Object} Ethers transaction object.
   */
  public async exit (txHash: string, chain: TChain) {
    chain = this.toChainModel(chain)
    const recipient = await this.getSignerAddress()
    const { MaticPOSClient } = require('@maticnetwork/maticjs')
    const Web3 = require('web3')

    const posRootChainManagerAddress = this.getL1PosRootChainManagerAddress(
      this.token,
      chain
    )
    if (!posRootChainManagerAddress) {
      throw new Error(
        `token "${this.token.symbol}" on chain "${chain.slug}" is unsupported`
      )
    }

    const posERC20PredicateAddress = this.getL1PosErc20PredicateAddress(
      this.token,
      chain
    )
    if (!posERC20PredicateAddress) {
      throw new Error(
        `token "${this.token.symbol}" on chain "${chain.slug}" is unsupported`
      )
    }

    const maticPOSClient = new MaticPOSClient({
      network: Chain.Ethereum.chainId === 1 ? 'mainnet' : 'testnet',
      maticProvider: new Web3.providers.HttpProvider(Chain.Polygon.rpcUrl),
      parentProvider: new Web3.providers.HttpProvider(Chain.Ethereum.rpcUrl),
      posRootChainManager: posRootChainManagerAddress,
      posERC20Predicate: posERC20PredicateAddress
    })

    const tx = await maticPOSClient.exitERC20(txHash, {
      from: recipient,
      encodeAbi: true
    })

    const provider = await this.getSignerOrProvider(chain)
    return (provider as any).sendTransaction({
      to: tx.to,
      value: tx.value,
      data: tx.data,
      gasLimit: tx.gas
    })
  }

  /**
   * @desc Checks if the amount of tokens is allowed by the canonical token bridge,
   * otherwise throw an error.
   * @param {Object} chain - Chain model.
   * @param {Object} canonicalBridge - Ethers contract object for canonical token bridge.
   * @param {Object} amount - Token amount.
   */
  private async checkMaxTokensAllowed (
    chain: Chain,
    canonicalBridge: Contract,
    amount: TAmount
  ) {
    if (chain.equals(Chain.xDai)) {
      const tokenAddress = this.getL1CanonicalTokenAddress(
        this.token,
        Chain.Ethereum
      )
      if (!tokenAddress) {
        throw new Error(
          `token "${this.token.symbol}" on chain "${Chain.Ethereum.slug}" is unsupported`
        )
      }
      const maxPerTx = await canonicalBridge?.maxPerTx()
      const formattedMaxPerTx = Number(
        formatUnits(maxPerTx.toString(), this.token.decimals)
      )
      const formattedAmount = Number(
        formatUnits(amount.toString(), this.token.decimals)
      )
      if (formattedAmount > formattedMaxPerTx) {
        throw new Error(
          `Max allowed by xDai Bridge is ${formattedMaxPerTx} tokens`
        )
      }
    }
  }

  // xDai AMB bridge
  async getAmbBridge (chain?: TChain) {
    chain = this.toChainModel(chain || this.chain)
    if (chain.equals(Chain.Ethereum)) {
      const address = this.getL1AmbBridgeAddress(this.token, Chain.xDai)
      const provider = await this.getSignerOrProvider(Chain.Ethereum)
      return new Contract(address, l1HomeAmbNativeToErc20, provider)
    }
    const address = this.getL2AmbBridgeAddress(this.token, Chain.xDai)
    const provider = await this.getSignerOrProvider(Chain.xDai)
    return new Contract(address, l1HomeAmbNativeToErc20, provider)
  }

  async getL2CanonicalBridge (chain: TChain) {
    chain = this.toChainModel(chain || this.chain)
    const address = this.getL2CanonicalBridgeAddress(this.token, chain)
    if (!address) {
      throw new Error(
        `token "${this.token.symbol}" on chain "${chain.slug}" is unsupported`
      )
    }
    const provider = await this.getSignerOrProvider(chain)
    let abi: any[]
    if (chain.equals(Chain.Polygon)) {
      abi = l2PolygonChildErc20Abi
    } else if (chain.equals(Chain.xDai)) {
      abi = l2xDaiTokenAbi
    } else if (chain.equals(Chain.Arbitrum)) {
      abi = arbErc20Abi
    } else if (chain.equals(Chain.Optimism)) {
      abi = l2OptimismTokenBridgeAbi
    }
    return new Contract(address, abi, provider)
  }

  async getL1CanonicalBridge (chain: TChain) {
    chain = this.toChainModel(chain || this.chain)
    const address = this.getL1CanonicalBridgeAddress(this.token, chain)
    if (!address) {
      throw new Error(
        `token "${this.token.symbol}" on chain "${chain.slug}" is unsupported`
      )
    }
    const provider = await this.getSignerOrProvider(Chain.Ethereum)
    let abi: any[]
    if (chain.equals(Chain.Polygon)) {
      abi = l1PolygonPosRootChainManagerAbi
    } else if (chain.equals(Chain.xDai)) {
      abi = l1xDaiForeignOmniBridgeAbi
    } else if (chain.equals(Chain.Arbitrum)) {
      abi = arbitrumGlobalInboxAbi
    } else if (chain.equals(Chain.Optimism)) {
      abi = l1OptimismTokenBridgeAbi
    }
    return new Contract(address, abi, provider)
  }
}

export default CanonicalBridge