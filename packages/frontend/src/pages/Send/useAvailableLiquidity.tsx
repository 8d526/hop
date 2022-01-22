import { HopBridge } from '@hop-protocol/sdk'
import { useQuery } from 'react-query'

const useAvailableLiquidity = (
  bridge?: HopBridge,
  sourceChain?: string,
  destinationChain?: string
) => {
  const queryKey = `availableLiquidity:${bridge?.network}:${sourceChain}:${destinationChain}`

  const { isLoading, data, error } = useQuery(
    [queryKey, bridge?.network, sourceChain, destinationChain],
    async () => {
      if (bridge?.network && sourceChain && destinationChain) {
        return bridge.getFrontendAvailableLiquidity(sourceChain, destinationChain)
      }
    },
    {
      enabled: !!bridge?.network && !!sourceChain && !!destinationChain,
      refetchInterval: 15e3,
    }
  )

  return {
    availableLiquidity: data,
    isLoading,
    error,
  }
}

export default useAvailableLiquidity
