import { Wallet, Contract } from 'ethers'
import { Web3Provider } from 'ethers/providers'
import { deployContract } from 'ethereum-waffle'

import { expandTo18Decimals } from './utilities'

import GravisFactory from '../../buildV2/GravisFactory.json'
import IGravisPair from '../../build/IGravisPair.json'

import ERC20 from '../../build/ERC20.json'
import WETH9 from '../../build/WETH9.json'
import UniswapV1Exchange from '../../build/UniswapV1Exchange.json'
import UniswapV1Factory from '../../build/UniswapV1Factory.json'
import GravisRouter01 from '../../build/GravisRouter01.json'
import GravisMigrator from '../../build/GravisMigrator.json'
import GravisRouter02 from '../../build/GravisRouter.json'
import RouterEventEmitter from '../../build/RouterEventEmitter.json'
import { AddressZero } from 'ethers/constants'

const overrides = {
  gasLimit: 9999999
}

interface V2Fixture {
  token0: Contract
  token1: Contract
  WETH: Contract
  WETHPartner: Contract
  factoryV1: Contract
  factoryV2: Contract
  router01: Contract
  router02: Contract
  routerEventEmitter: Contract
  router: Contract
  migrator: Contract
  WETHExchangeV1: Contract
  pair: Contract
  WETHPair: Contract
}

interface AddPairResult {
  token0: Contract
  token1: Contract
}

export async function addPair(
  provider: Web3Provider,
  [wallet]: Wallet[],
  factoryV2: Contract,
  tokenA: Contract,
  tokenB: Contract
): Promise<AddPairResult> {
  // initialize V2

  if (AddressZero === (await factoryV2.getPair(tokenA.address, tokenB.address)).toString()) {
    await factoryV2.createPair(tokenA.address, tokenB.address)
  }

  const pairAddress = await factoryV2.getPair(tokenA.address, tokenB.address)
  const pair = new Contract(pairAddress, JSON.stringify(IGravisPair.abi), provider).connect(wallet)

  const token0Address = await pair.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  return {
    token0,
    token1,
  }
}

export async function issueToken([wallet]: Wallet[], amount: number = 10000) {
  return await deployContract(wallet, ERC20, [expandTo18Decimals(amount)])
}

export async function getPair(provider: Web3Provider, [wallet]: Wallet[], factoryV2: Contract, tokenA: Contract, tokenB: Contract) {
  const pairAddress = await factoryV2.getPair(tokenA.address, tokenB.address)
  return new Contract(pairAddress, JSON.stringify(IGravisPair.abi), provider).connect(wallet)
}

export async function v2Fixture(provider: Web3Provider, [wallet]: Wallet[]): Promise<V2Fixture> {
  // deploy tokens
  const tokenA = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)])
  const tokenB = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)])
  const WETH = await deployContract(wallet, WETH9)
  const WETHPartner = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)])

  // deploy V1
  const factoryV1 = await deployContract(wallet, UniswapV1Factory, [])
  await factoryV1.initializeFactory((await deployContract(wallet, UniswapV1Exchange, [])).address)

  // deploy V2
  const factoryV2 = await deployContract(wallet, GravisFactory, [wallet.address])

  // deploy routers
  const router01 = await deployContract(wallet, GravisRouter01, [factoryV2.address, WETH.address], overrides)
  const router02 = await deployContract(wallet, GravisRouter02, [factoryV2.address, WETH.address], overrides)

  // event emitter for testing
  const routerEventEmitter = await deployContract(wallet, RouterEventEmitter, [])

  // deploy migrator
  const migrator = await deployContract(wallet, GravisMigrator, [factoryV1.address, router01.address], overrides)

  // initialize V1
  await factoryV1.createExchange(WETHPartner.address, overrides)
  const WETHExchangeV1Address = await factoryV1.getExchange(WETHPartner.address)
  const WETHExchangeV1 = new Contract(WETHExchangeV1Address, JSON.stringify(UniswapV1Exchange.abi), provider).connect(
    wallet
  )

  // initialize V2
  await factoryV2.createPair(tokenA.address, tokenB.address)
  const pairAddress = await factoryV2.getPair(tokenA.address, tokenB.address)
  const pair = new Contract(pairAddress, JSON.stringify(IGravisPair.abi), provider).connect(wallet)

  const token0Address = await pair.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  await factoryV2.createPair(WETH.address, WETHPartner.address)
  const WETHPairAddress = await factoryV2.getPair(WETH.address, WETHPartner.address)
  const WETHPair = new Contract(WETHPairAddress, JSON.stringify(IGravisPair.abi), provider).connect(wallet)


  console.log('INIT_CODE_PAIR_HASH', await factoryV2.INIT_CODE_PAIR_HASH());


  return {
    token0,
    token1,
    WETH,
    WETHPartner,
    factoryV1,
    factoryV2,
    router01,
    router02,
    router: router02, // the default router, 01 had a minor bug
    routerEventEmitter,
    migrator,
    WETHExchangeV1,
    pair,
    WETHPair
  }
}
