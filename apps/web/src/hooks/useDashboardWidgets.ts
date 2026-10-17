import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PREFERENCE_KEYS } from '@/lib/api'
import { parseHiddenWidgets, type DashboardWidgetId } from '@/lib/dashboard-widgets'
import { preferencesKeys, usePreferences, useSetPreference } from './useSummary'

/**
 * Which dashboard widgets are switched on (user-wide preference)
 */
export function useDashboardWidgets(enabled: boolean = true) {
  const queryClient = useQueryClient()
  const { data: preferences, isLoading } = usePreferences(undefined, enabled)
  const setPreferenceMutation = useSetPreference()

  const hidden = useMemo(
    () => parseHiddenWidgets(preferences?.[PREFERENCE_KEYS.DASHBOARD_HIDDEN_WIDGETS]),
    [preferences]
  )

  const saveHidden = useCallback(
    (next: DashboardWidgetId[]) => {
      const value = JSON.stringify(next)
      // Show the change straight away; saving refetches the preferences afterwards
      queryClient.setQueryData<Record<string, string>>(
        preferencesKeys.byProfile(undefined),
        (old) => ({
          ...old,
          [PREFERENCE_KEYS.DASHBOARD_HIDDEN_WIDGETS]: value,
        })
      )
      setPreferenceMutation.mutate({ key: PREFERENCE_KEYS.DASHBOARD_HIDDEN_WIDGETS, value })
    },
    [queryClient, setPreferenceMutation]
  )

  const isVisible = useCallback((id: DashboardWidgetId) => !hidden.includes(id), [hidden])

  const setVisible = useCallback(
    (id: DashboardWidgetId, visible: boolean) => {
      saveHidden(visible ? hidden.filter((w) => w !== id) : [...hidden, id])
    },
    [hidden, saveHidden]
  )

  return { isVisible, setVisible, isLoading }
}
