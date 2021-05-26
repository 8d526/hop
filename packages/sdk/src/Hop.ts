import EventEmitter from 'eventemitter3'
import { Contract, Signer } from 'ethers'
import { erc20Abi } from '@hop-protocol/abi'
import { Chain, Token } from './models'
import { wait } from './utils'
import HopBridge from './HopBridge'
import CanonicalBridge from './CanonicalBridge'
import { TChain, TToken, TProvider } from './types'
import Base from './Base'
import { Network } from './constants'
import _version from './version'

const transferSentTopic =
  '0x5a4dabefa20e4685729030de2db148bc227da9d371286964568fbfafe29ae1b2'

/**
 * @desc Event types for transaction watcher.
 */
enum Event {
  Receipt = 'receipt',
  SourceTxReceipt = 'sourceTxReceipt',
  DestinationTxReceipt = 'destinationTxReceipt'
}

/**
 * @desc Event watcher options
 */
type WatchOptions = {
  destinationHeadBlockNumber?: number
}

/**
 * Class reprensenting Hop
 * @namespace Hop
 */
class Hop extends Base {
  /** Event enum */
  static Event = Event

  /** Chain class */
  static Chain = Chain

  /** Token class */
  static Token = Token

  /** Event enum */
  Event = Event

  /** Chain class */
  Chain = Chain

  /** Token class */
  Token = Token

  /**
   * @desc Instantiates Hop SDK.
   * Returns a new Hop SDK instance.
   * @param {String} network - L1 network name (e.g. 'mainnet', 'kovan', 'goerli')
   * @param {Object} signer - Ethers `Signer` for signing transactions.
   * @returns {Object} New Hop SDK instance.
   * @example
   *```js
   *import { Hop } from '@hop-protocol/sdk'
   *
   *const hop = new Hop('mainnet')
   *```
   * @example
   *```js
   *import { Hop } from '@hop-protocol/sdk'
   *import { Wallet } from 'ethers'
   *
   *const signer = new Wallet(privateKey)
   *const hop = new Hop('mainnet', signer)
   *```
   */
  constructor (network: string = Network.Kovan, signer?: TProvider) {
    super(network, signer)
  }

  /**
   * @desc Returns a bridge set instance.
   * @param {Object} token - Token model or symbol of token of bridge to use.
   * @param {Object} sourceChain - Source chain model.
   * @param {Object} destinationChain - Destination chain model.
   * @returns {Object} A HopBridge instance.
   * @example
   *```js
   *import { Hop, Token } from '@hop-protocol/sdk'
   *
   *const hop = new Hop()
   *const bridge = hop.bridge(Token.USDC)
   *```
   */
  public bridge (
    token: TToken,
    sourceChain?: TChain,
    destinationChain?: TChain
  ) {
    return new HopBridge(
      this.network,
      this.signer,
      token,
      sourceChain,
      destinationChain
    )
  }

  /**
   * @desc Returns a canonical bridge sdk instance.
   * @param {Object} token - Token model or symbol of token of canonical bridge to use.
   * @param {Object} chain - Chain model.
   * @returns {Object} A CanonicalBridge instance.
   * @example
   *```js
   *import { Hop, Token } from '@hop-protocol/sdk'
   *
   *const hop = new Hop()
   *const bridge = hop.canonicalBridge(Token.USDC)
   *```
   */
  public canonicalBridge (token: TToken, chain?: TChain) {
    return new CanonicalBridge(this.network, this.signer, token, chain)
  }

  /**
   * @desc Returns hop instance with signer connected. Used for adding or changing signer.
   * @param {Object} signer - Ethers `Signer` for signing transactions.
   * @returns {Object} A new Hop SDK instance with connected Ethers Signer.
   * @example
   *```js
   *import { Hop } from '@hop-protocol/sdk'
   *import { Wallet } from 'ethers'
   *
   *const signer = new Wallet(privateKey)
   *let hop = new Hop()
   * // ...
   *hop = hop.connect(signer)
   *```
   */
  connect (signer: TProvider) {
    this.signer = signer
    return new Hop(this.network, signer)
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
  public getSignerAddress () {
    return (this.signer as Signer).getAddress()
  }

  /**
   * @desc Returns the SDK version.
   * @returns {String} version string
   * @example
   *```js
   *import { Hop } from '@hop-protocol/sdk'
   *
   *const hop = new Hop()
   *console.log(hop.version)
   *```
   */
  public get version () {
    return _version
  }

  /**
   * @desc Watches for Hop transaction events.
   * @param {String} txHash - Source transaction hash.
   * @param {Token} token - Token name or model.
   * @param {Object} sourceChain - Source chain name or model.
   * @param {Object} destinationChain - Destination chain name or model.
   * @example
   *```js
   *import { Hop } from '@hop-protocol/sdk'
   *
   *const hop = new Hop()
   * hop
   *   .watch(tx.hash, Token.USDC, Chain.Ethereum, Chain.xDai)
   *   .on('receipt', ({receipt, chain}) => {
   *     console.log(chain.Name, receipt)
   *   })
   *```
   */
  public watch (
    txHash: string,
    token: TToken,
    sourceChain: TChain,
    destinationChain: TChain,
    isCanonicalTransfer: boolean = false,
    options: WatchOptions = {}
  ) {
    // TODO: detect type of transfer
    return isCanonicalTransfer
      ? this.watchCanonical(txHash, token, sourceChain, destinationChain)
      : this.watchBridge(txHash, token, sourceChain, destinationChain, options)
  }

  public watchBridge (
    txHash: string,
    token: TToken,
    _sourceChain: TChain,
    _destinationChain: TChain,
    options: WatchOptions = {}
  ) {
    const pollDelayMs = 10 * 1000

    // TODO: clean up
    token = this.toTokenModel(token)
    const sourceChain = this.toChainModel(_sourceChain)
    const destinationChain = this.toChainModel(_destinationChain)
    const ee = new EventEmitter()

    const update = async () => {
      const bridge = this.bridge(token, sourceChain, destinationChain)
      const l1Bridge = await bridge.getL1Bridge()

      const receipt = await sourceChain.provider.waitForTransaction(txHash)
      ee.emit(Event.Receipt, { chain: sourceChain, receipt })
      ee.emit(Event.SourceTxReceipt, { chain: sourceChain, receipt })
      if (!receipt.status) {
        return
      }
      const sourceTx = await sourceChain.provider.getTransaction(txHash)
      const sourceBlock = await sourceChain.provider.getBlock(
        sourceTx.blockNumber as number
      )
      const sourceTimestamp = sourceBlock?.timestamp
      let startBlock = -1
      let endBlock = -1
      let pollDest: () => Promise<boolean>

      // L1 -> L2
      if (sourceChain.isL1) {
        const wrapper = await bridge.getAmmWrapper(destinationChain)
        const decodedSource = l1Bridge?.interface.decodeFunctionData(
          'sendToL2',
          sourceTx.data
        )

        let attemptedSwap = Number(decodedSource.deadline.toString()) > 0
        //const chainId = decodedSource?.chainId
        const l2Bridge = await bridge.getL2Bridge(destinationChain)
        const exchange = await bridge.getSaddleSwap(destinationChain)
        let destTx: any
        pollDest = async () => {
          const blockNumber = await destinationChain.provider.getBlockNumber()
          if (!blockNumber) {
            return false
          }
          if (startBlock === -1) {
            startBlock = blockNumber - 1000
          } else {
            startBlock = endBlock
          }
          endBlock = blockNumber
          let recentLogs: any[]
          if (attemptedSwap) {
            recentLogs =
              (await exchange?.queryFilter(
                exchange.filters.TokenSwap(),
                startBlock,
                endBlock
              )) ?? []
            recentLogs = recentLogs.reverse()
            if (!recentLogs || !recentLogs.length) {
              return false
            }
            for (let item of recentLogs) {
              const decodedLog = item.decode(item.data, item.topics)
              if (wrapper.address === decodedLog.buyer) {
                if (
                  decodedSource?.amount.toString() !==
                  decodedLog.tokensSold.toString()
                ) {
                  continue
                }
                destTx = await item.getTransaction()
              }
            }
          } else if (destinationChain.equals(Chain.xDai)) {
            const ambBridge = await bridge.getAmbBridge(Chain.xDai)
            recentLogs =
              (await ambBridge?.queryFilter(
                {
                  address: bridge.getL2HopBridgeTokenAddress(token, Chain.xDai)
                },
                startBlock,
                endBlock
              )) ?? []
            recentLogs = recentLogs.reverse()
            if (!recentLogs || !recentLogs.length) {
              return false
            }

            for (let item of recentLogs) {
              const receipt = await item.getTransactionReceipt()
              for (let i in receipt.logs) {
                const transferTopic =
                  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
                if (receipt.logs[i].topics[0] === transferTopic) {
                  if (
                    receipt.logs[i].topics[2].includes(
                      sourceTx.from.toLowerCase().replace('0x', '')
                    )
                  ) {
                    destTx = await item.getTransaction()
                  }
                }
              }
            }
          }
          if (!sourceTimestamp) {
            return false
          }
          if (!destTx) {
            return false
          }
          const destBlock = await destinationChain.provider.getBlock(
            destTx.blockNumber
          )
          if (!destBlock) {
            return false
          }
          if (destBlock.timestamp - sourceTimestamp < 500) {
            const destTxReceipt = await destinationChain.provider.waitForTransaction(
              destTx.hash
            )
            ee.emit(Event.Receipt, {
              chain: destinationChain,
              receipt: destTxReceipt
            })
            ee.emit(Event.DestinationTxReceipt, {
              chain: destinationChain,
              receipt: destTxReceipt
            })
            return true
          }
        }
      }

      // L2 -> L1
      if (!sourceChain.isL1 && destinationChain?.isL1) {
        const wrapper = await bridge.getAmmWrapper(sourceChain)
        let decodedSource: any
        let attemptedSwap = false
        try {
          decodedSource = wrapper?.interface.decodeFunctionData(
            'swapAndSend',
            sourceTx.data
          )
          attemptedSwap = true
        } catch (err) {
          const l2Bridge = await bridge.getL2Bridge(sourceChain)
          decodedSource = l2Bridge?.interface.decodeFunctionData(
            'send',
            sourceTx.data
          )
        }
        let transferHash: string = ''
        for (let log of receipt.logs) {
          if (log.topics[0] === transferSentTopic) {
            transferHash = log.topics[1]
          }
        }
        if (!transferHash) {
          return false
        }
        pollDest = async () => {
          const blockNumber = await destinationChain.provider.getBlockNumber()
          if (!blockNumber) {
            return false
          }
          if (startBlock === -1) {
            startBlock = blockNumber - 1000
          } else {
            startBlock = endBlock
          }
          endBlock = blockNumber
          let recentLogs: any[] =
            (await l1Bridge?.queryFilter(
              l1Bridge.filters.WithdrawalBonded(),
              startBlock,
              endBlock
            )) ?? []
          recentLogs = recentLogs.reverse()
          if (!recentLogs || !recentLogs.length) {
            return false
          }
          for (let item of recentLogs) {
            if (item.topics[1] === transferHash) {
              const destTx = await item.getTransaction()
              if (!destTx) {
                continue
              }
              const destTxReceipt = await destinationChain.provider.waitForTransaction(
                destTx.hash
              )
              ee.emit(Event.Receipt, {
                chain: destinationChain,
                receipt: destTxReceipt
              })
              ee.emit(Event.DestinationTxReceipt, {
                chain: destinationChain,
                receipt: destTxReceipt
              })
              return true
            }
          }
          return false
        }
      }

      // L2 -> L2
      if (!sourceChain.isL1 && !destinationChain?.isL1) {
        try {
          const wrapperSource = await bridge.getAmmWrapper(sourceChain)
          const wrapperDest = await bridge.getAmmWrapper(destinationChain)
          const l2Dest = await bridge.getL2Bridge(destinationChain)
          const exchange = await bridge.getSaddleSwap(destinationChain)
          const decodedSource = wrapperSource?.interface.decodeFunctionData(
            'swapAndSend',
            sourceTx.data
          )
          let transferHash: string = ''
          for (let log of receipt.logs) {
            if (log.topics[0] === transferSentTopic) {
              transferHash = log.topics[1]
              break
            }
          }
          if (!transferHash) {
            return false
          }
          pollDest = async () => {
            let headBlock =
              options?.destinationHeadBlockNumber ||
              (await destinationChain.provider.getBlockNumber())
            if (!headBlock) {
              return false
            }
            let tailBlock = headBlock - 10000
            const getRecentLogs = async (head: number): Promise<any[]> => {
              if (head < tailBlock) {
                return []
              }
              const start = head - 1000
              const end = head
              let recentLogs: any[] =
                (await l2Dest?.queryFilter(
                  l2Dest.filters.WithdrawalBonded(),
                  start,
                  end
                )) ?? []
              recentLogs = recentLogs.reverse()
              if (recentLogs.length) {
                return recentLogs
              }
              return getRecentLogs(start)
            }
            let recentLogs = await getRecentLogs(headBlock)
            for (let item of recentLogs) {
              const decodedLog = item.decode(item.data, item.topics)
              if (transferHash === decodedLog.transferId) {
                if (!sourceTimestamp) {
                  continue
                }
                const destTx = await item.getTransaction()
                if (!destTx) {
                  continue
                }
                const destBlock = await destinationChain.provider.getBlock(
                  destTx.blockNumber
                )
                if (!destBlock) {
                  continue
                }
                const destTxReceipt = await destinationChain.provider.waitForTransaction(
                  destTx.hash
                )
                ee.emit(Event.Receipt, {
                  chain: destinationChain,
                  receipt: destTxReceipt
                })
                ee.emit(Event.DestinationTxReceipt, {
                  chain: destinationChain,
                  receipt: destTxReceipt
                })
                return true
              }
              return false
            }
            return false
          }
        } catch (err) {
          console.log(err)
          // events for token swap on L2 (ie saddle convert page on UI)
          const exchange = await bridge.getSaddleSwap(destinationChain)
          pollDest = async () => {
            const blockNumber = await destinationChain.provider.getBlockNumber()
            if (!blockNumber) {
              return false
            }
            if (startBlock === -1) {
              startBlock = endBlock - 100
            } else {
              startBlock = endBlock
            }
            endBlock = blockNumber
            let recentLogs: any[] =
              (await exchange?.queryFilter(
                exchange.filters.TokenSwap(),
                startBlock,
                endBlock
              )) ?? []
            recentLogs = recentLogs.reverse()
            if (!recentLogs || !recentLogs.length) {
              return false
            }
            for (let item of recentLogs) {
              const decodedLog = item.decode(item.data, item.topics)
              if (sourceTx.from === decodedLog.buyer) {
                if (!sourceTimestamp) {
                  continue
                }
                const destTx = await item.getTransaction()
                if (!destTx) {
                  continue
                }
                const destBlock = await destinationChain.provider.getBlock(
                  destTx.blockNumber
                )
                if (!destBlock) {
                  continue
                }
                if (destBlock.timestamp - sourceTimestamp < 500) {
                  const destTxReceipt = await destinationChain.provider.waitForTransaction(
                    destTx.hash
                  )
                  ee.emit(Event.Receipt, {
                    chain: destinationChain,
                    receipt: destTxReceipt
                  })
                  ee.emit(Event.DestinationTxReceipt, {
                    chain: destinationChain,
                    receipt: destTxReceipt
                  })
                  return true
                }
              }
              return false
            }
            return false
          }
        }
      }

      if (!pollDest) {
        return
      }
      let res = false
      while (!res) {
        res = await pollDest()
        await wait(pollDelayMs)
      }
    }

    update().catch((err: Error) => ee.emit('error', err))

    return ee
  }

  public watchCanonical (
    txHash: string,
    token: TToken,
    _sourceChain: TChain,
    _destinationChain: TChain
  ) {
    const pollDelayMs = 10 * 1000

    // TODO: clean up
    token = this.toTokenModel(token)
    const sourceChain = this.toChainModel(_sourceChain)
    const destinationChain = this.toChainModel(_destinationChain)
    const ee = new EventEmitter()

    const update = async () => {
      const bridge = this.bridge(token, sourceChain, destinationChain)
      const l1Bridge = await bridge.getL1Bridge()

      const receipt = await sourceChain.provider.waitForTransaction(txHash)
      ee.emit(Event.Receipt, { chain: sourceChain, receipt })
      ee.emit(Event.SourceTxReceipt, { chain: sourceChain, receipt })
      if (!receipt.status) {
        return
      }
      const sourceTx = await sourceChain.provider.getTransaction(txHash)
      const sourceBlock = await sourceChain.provider.getBlock(
        sourceTx.blockNumber as number
      )
      const sourceTimestamp = sourceBlock?.timestamp
      let startBlock = -1
      let endBlock = -1
      let pollDest: () => Promise<boolean>

      // L1 -> L2
      if (sourceChain.isL1) {
        if (destinationChain.equals(Chain.xDai)) {
          pollDest = async () => {
            const blockNumber = await destinationChain.provider.getBlockNumber()
            if (!blockNumber) {
              return false
            }
            if (startBlock === -1) {
              startBlock = endBlock - 100
            } else {
              startBlock = endBlock
            }
            endBlock = blockNumber
            const canonicalBridge = await this.canonicalBridge(
              token,
              Chain.xDai
            )
            const ambBridge = await canonicalBridge.getAmbBridge(Chain.xDai)
            let recentLogs: any[] =
              (await ambBridge?.queryFilter(
                {
                  address: this.getL2CanonicalTokenAddress(token, Chain.xDai)
                },
                startBlock,
                endBlock
              )) ?? []
            recentLogs = recentLogs.reverse()
            if (!recentLogs || !recentLogs.length) {
              return false
            }
            for (let item of recentLogs) {
              const receipt = await item.getTransactionReceipt()
              for (let i in receipt.logs) {
                const tokensBridgedTopic =
                  '0x9afd47907e25028cdaca89d193518c302bbb128617d5a992c5abd45815526593'
                if (receipt.logs[i].topics[0] === tokensBridgedTopic) {
                  if (
                    receipt.logs[i].topics[2].includes(
                      sourceTx.from.toLowerCase().replace('0x', '')
                    )
                  ) {
                    const destTx = await item.getTransaction()
                    if (!destTx) {
                      continue
                    }
                    const destTxReceipt = await destinationChain.provider.waitForTransaction(
                      destTx.hash
                    )
                    ee.emit(Event.Receipt, {
                      chain: destinationChain,
                      receipt: destTxReceipt
                    })
                    ee.emit(Event.DestinationTxReceipt, {
                      chain: destinationChain,
                      receipt: destTxReceipt
                    })
                    return true
                  }
                }
              }
            }
            return false
          }
        } else if (destinationChain.equals(Chain.Polygon)) {
          pollDest = async () => {
            const blockNumber = await destinationChain.provider.getBlockNumber()
            if (!blockNumber) {
              return false
            }
            if (startBlock === -1) {
              startBlock = endBlock - 100
            } else {
              startBlock = endBlock
            }
            endBlock = blockNumber
            const canonicalBridge = await this.canonicalBridge(
              token,
              Chain.Polygon
            )
            const tokenBridge = await canonicalBridge.getL2CanonicalBridge(
              Chain.Polygon
            )
            let recentLogs: any[] =
              (await tokenBridge?.queryFilter(
                {
                  address: canonicalBridge.getL2CanonicalTokenAddress(
                    token,
                    Chain.Polygon
                  )
                },
                startBlock,
                endBlock
              )) ?? []
            recentLogs = recentLogs.reverse()
            if (!recentLogs || !recentLogs.length) {
              return false
            }
            for (let item of recentLogs) {
              const receipt = await item.getTransactionReceipt()
              for (let i in receipt.logs) {
                const tokenTransferTopic =
                  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
                if (receipt.logs[i].topics[0] === tokenTransferTopic) {
                  if (
                    receipt.logs[i].topics[2].includes(
                      sourceTx.from.toLowerCase().replace('0x', '')
                    )
                  ) {
                    const destTx = await item.getTransaction()
                    if (!destTx) {
                      continue
                    }
                    const destTxReceipt = await destinationChain.provider.waitForTransaction(
                      destTx.hash
                    )
                    ee.emit(Event.Receipt, {
                      chain: destinationChain,
                      receipt: destTxReceipt
                    })
                    ee.emit(Event.DestinationTxReceipt, {
                      chain: destinationChain,
                      receipt: destTxReceipt
                    })
                    return true
                  }
                }
              }
            }
            return false
          }
        } else {
          throw new Error('not implemented')
        }
      }

      // L2 -> L1
      if (!sourceChain.isL1 && destinationChain?.isL1) {
        if (sourceChain.equals(Chain.xDai)) {
          pollDest = async () => {
            const blockNumber = await destinationChain.provider.getBlockNumber()
            if (!blockNumber) {
              return false
            }
            if (startBlock === -1) {
              startBlock = endBlock - 100
            } else {
              startBlock = endBlock
            }
            endBlock = blockNumber
            const canonicalBridge = await this.canonicalBridge(
              token,
              Chain.xDai
            )
            const ambBridge = await canonicalBridge.getAmbBridge(Chain.Ethereum)
            let recentLogs: any[] =
              (await ambBridge?.queryFilter(
                {
                  address: canonicalBridge.getL1CanonicalTokenAddress(
                    token,
                    Chain.xDai
                  )
                },
                startBlock,
                endBlock
              )) ?? []
            recentLogs = recentLogs.reverse()
            if (!recentLogs || !recentLogs.length) {
              return false
            }
            for (let item of recentLogs) {
              const receipt = await item.getTransactionReceipt()
              for (let i in receipt.logs) {
                const tokensBridgedTopic =
                  '0x9afd47907e25028cdaca89d193518c302bbb128617d5a992c5abd45815526593'
                if (receipt.logs[i].topics[0] === tokensBridgedTopic) {
                  if (
                    receipt.logs[i].topics[2].includes(
                      sourceTx.from.toLowerCase().replace('0x', '')
                    )
                  ) {
                    const destTx = await item.getTransaction()
                    if (!destTx) {
                      continue
                    }
                    const destTxReceipt = await destinationChain.provider.waitForTransaction(
                      destTx.hash
                    )
                    ee.emit(Event.Receipt, {
                      chain: destinationChain,
                      receipt: destTxReceipt
                    })
                    ee.emit(Event.DestinationTxReceipt, {
                      chain: destinationChain,
                      receipt: destTxReceipt
                    })
                    return true
                  }
                }
              }
            }
            return false
          }
        } else if (sourceChain.equals(Chain.Polygon)) {
          pollDest = async () => {
            const blockNumber = await destinationChain.provider.getBlockNumber()
            if (!blockNumber) {
              return false
            }
            if (startBlock === -1) {
              startBlock = endBlock - 100
            } else {
              startBlock = endBlock
            }
            endBlock = blockNumber
            const tokenAddress = this.getL1CanonicalTokenAddress(
              token,
              Chain.Ethereum
            )
            const contract = new Contract(
              tokenAddress,
              erc20Abi,
              await this.getSignerOrProvider(Chain.Ethereum)
            )
            let recentLogs: any[] =
              (await contract?.queryFilter(
                {
                  topics: []
                },
                startBlock,
                endBlock
              )) ?? []
            recentLogs = recentLogs.reverse()
            if (!recentLogs || !recentLogs.length) {
              return false
            }
            for (let item of recentLogs) {
              const receipt = await item.getTransactionReceipt()
              for (let i in receipt.logs) {
                const tokenTransferTopic =
                  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
                if (receipt.logs[i].topics[0] === tokenTransferTopic) {
                  if (
                    receipt.logs[i].topics[2].includes(
                      sourceTx.from.toLowerCase().replace('0x', '')
                    )
                  ) {
                    if (
                      !receipt.logs[i].topics[1].includes(
                        this.getL1PosErc20PredicateAddress(token, Chain.Polygon)
                          .toLowerCase()
                          .replace('0x', '')
                      )
                    ) {
                      continue
                    }

                    const destTx = await item.getTransaction()
                    if (!destTx) {
                      continue
                    }
                    const destTxReceipt = await destinationChain.provider.waitForTransaction(
                      destTx.hash
                    )
                    ee.emit(Event.Receipt, {
                      chain: destinationChain,
                      receipt: destTxReceipt
                    })
                    ee.emit(Event.DestinationTxReceipt, {
                      chain: destinationChain,
                      receipt: destTxReceipt
                    })
                    return true
                  }
                }
              }
            }
            return false
          }
        } else {
          throw new Error('not implemented')
        }
      }

      // L2 -> L2
      if (!sourceChain.isL1 && !destinationChain?.isL1) {
        throw new Error('not implemented')
      }

      if (!pollDest) {
        return
      }
      let res = false
      while (!res) {
        res = await pollDest()
        await wait(pollDelayMs)
      }
    }

    update().catch((err: Error) => ee.emit('error', err))

    return ee
  }
}

export default Hop