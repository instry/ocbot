import { createPublicClient, http, type Chain } from 'viem'
import { base, baseSepolia } from 'viem/chains'
import type { NetworkId } from './types'

const USDC_ADDRESSES: Record<NetworkId, `0x${string}`> = {
  'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
}

export function getChain(network: NetworkId): Chain {
  return network === 'base' ? base : baseSepolia
}

export function getUsdcAddress(network: NetworkId): `0x${string}` {
  return USDC_ADDRESSES[network]
}

export function getPublicClient(network: NetworkId) {
  const chain = getChain(network)
  return createPublicClient({
    chain,
    transport: http(),
  })
}
