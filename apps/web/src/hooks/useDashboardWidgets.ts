import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PREFERENCE_KEYS } from '@/lib/api'
import {
  moveWidget,
  parseFullWidthWidgets,
  parseHiddenWidgets,
  parseWidgetOrder,
  type DashboardWidgetId,
} from '@/lib/dashboard-widgets'
import { preferencesKeys, usePreferences, useSetPreference } from './useSummary'

/**
 * Which dashboard widgets are switched on, in what order, and which are full width (user-wide preferences)
 */
export function useDashboardWidgets(enabled: boolean = true) {
  const queryClient = useQueryClient()
  const { data: preferences, isLoading } = usePreferences(undefined, enabled)
  const setPreferenceMutation = useSetPreference()

  const hidden = useMemo(
    () => parseHiddenWidgets(preferences?.[PREFERENCE_KEYS.DASHBOARD_HIDDEN_WIDGETS]),
    [preferences]
  )

  const order = useMemo(
    () => parseWidgetOrder(preferences?.[PREFERENCE_KEYS.DASHBOARD_WIDGET_ORDER]),
    [preferences]
  )

  const fullWidth = useMemo(
    () =>
      new Set(parseFullWidthWidgets(preferences?.[PREFERENCE_KEYS.DASHBOARD_FULL_WIDTH_WIDGETS])),
    [preferences]
  )

  const savePreference = useCallback(
    (key: string, ids: DashboardWidgetId[]) => {
      const value = JSON.stringify(ids)
      // Show the change straight away; saving refetches the preferences afterwards
      queryClient.setQueryData<Record<string, string>>(
        preferencesKeys.byProfile(undefined),
        (old) => ({ ...old, [key]: value })
      )
      setPreferenceMutation.mutate({ key, value })
    },
    [queryClient, setPreferenceMutation]
  )

  const isVisible = useCallback((id: DashboardWidgetId) => !hidden.includes(id), [hidden])

  const setVisible = useCallback(
    (id: DashboardWidgetId, visible: boolean) => {
      savePreference(
        PREFERENCE_KEYS.DASHBOARD_HIDDEN_WIDGETS,
        visible ? hidden.filter((w) => w !== id) : [...hidden, id]
      )
    },
    [hidden, savePreference]
  )

  const setFullWidth = useCallback(
    (id: DashboardWidgetId, full: boolean) => {
      const ids = [...fullWidth].filter((w) => w !== id)
      savePreference(PREFERENCE_KEYS.DASHBOARD_FULL_WIDTH_WIDGETS, full ? [...ids, id] : ids)
    },
    [fullWidth, savePreference]
  )

  /** Put a widget where another one currently sits */
  const reorder = useCallback(
    (id: DashboardWidgetId, targetId: DashboardWidgetId) => {
      const next = moveWidget(order, id, targetId)
      if (next !== order) savePreference(PREFERENCE_KEYS.DASHBOARD_WIDGET_ORDER, next)
    },
    [order, savePreference]
  )

  return { isVisible, setVisible, fullWidth, setFullWidth, order, reorder, isLoading }
}
