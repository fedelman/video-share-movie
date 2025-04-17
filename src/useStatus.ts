import { useCallback, useState } from 'react'

export interface Status {
  message: string
  isError?: boolean
}

export function useStatus() {
  const [status, setStatus] = useState<Status>({
    message: 'Waiting for connection...',
    isError: false,
  })

  const updateStatus = useCallback((message: string, isError = false) => {
    setStatus({ message, isError })
    if (!message) {
      return
    }
    if (isError) {
      console.error(message)
    } else {
      console.log(message)
    }
  }, [])

  return { status, updateStatus }
}
