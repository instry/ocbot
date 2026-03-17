import { formatEther, formatUnits, erc20Abi } from 'viem'
import { getPublicClient, getUsdcAddress } from './provider'
import type { NetworkId } from './types'

export async function fetchBalances(
  address: `0x${string}`,
  network: NetworkId,
): Promise<{ eth: string; usdc: string }> {
  const client = getPublicClient(network)

  const [ethBalance, usdcBalance] = await Promise.all([
    client.getBalance({ address }),
    client.readContract({
      address: getUsdcAddress(network),
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    }),
  ])

  return {
    eth: formatEther(ethBalance),
    usdc: formatUnits(usdcBalance, 6),
  }
}
