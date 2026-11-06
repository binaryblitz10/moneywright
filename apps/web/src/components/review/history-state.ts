import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

interface HistoryUiState {
  /** Months shown beyond This week / This month */
  extraMonths: number
  /** Ids of the rows that are expanded */
  openIds: string[]
}

const INITIAL: HistoryUiState = { extraMonths: 0, openIds: [] }
const KEY = ['review', 'history-ui'] as const

/**
 * What the History tab has open (Show more, expanded rows). It lives in the query cache, which
 * outlives the page, so it survives leaving Review and coming back, and logging out clears it.
 */
export function useHistoryUiState() {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: () => queryClient.getQueryData<HistoryUiState>(KEY) ?? INITIAL,
    initialData: INITIAL,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const update = useCallback(
    (change: (state: HistoryUiState) => HistoryUiState) =>
      queryClient.setQueryData<HistoryUiState>(KEY, (state) => change(state ?? INITIAL)),
    [queryClient]
  )

  const showMore = useCallback(
    () => update((state) => ({ ...state, extraMonths: state.extraMonths + 1 })),
    [update]
  )

  const setOpen = useCallback(
    (id: string, open: boolean) =>
      update((state) => ({
        ...state,
        openIds: open
          ? [...state.openIds.filter((openId) => openId !== id), id]
          : state.openIds.filter((openId) => openId !== id),
      })),
    [update]
  )

  return { extraMonths: data.extraMonths, openIds: data.openIds, showMore, setOpen }
}
