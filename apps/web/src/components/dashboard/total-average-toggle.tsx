/**
 * Toggle between a total and a per-month average on dashboard cards
 */

import { SegmentedControl } from '@/components/ui/segmented-control'

interface TotalAverageToggleProps {
  showMonthlyAverage: boolean
  onChange: (showMonthlyAverage: boolean) => void
}

export function TotalAverageToggle({ showMonthlyAverage, onChange }: TotalAverageToggleProps) {
  return (
    <SegmentedControl
      aria-label="Show total or monthly average"
      size="sm"
      value={showMonthlyAverage ? 'average' : 'total'}
      onChange={(value) => onChange(value === 'average')}
      options={[
        { value: 'total', label: 'Total' },
        { value: 'average', label: '/mo' },
      ]}
    />
  )
}
