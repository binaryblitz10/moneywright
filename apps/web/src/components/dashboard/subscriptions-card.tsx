/**
 * Subscriptions card component
 */

import { Link } from '@tanstack/react-router'
import { SectionCard } from '@/components/ui/section-card'
import { Button } from '@/components/ui/button'
import { ChevronRight } from 'lucide-react'
import { SubscriptionsList } from './subscriptions-list'
import type { Subscription } from '@/lib/api'

interface SubscriptionsCardProps {
  subscriptions: Subscription[]
  totalMonthly: number
  currency: string
  getCategoryLabel: (code: string) => string
  isLoading: boolean
  countryCode: string
}

export function SubscriptionsCard({
  subscriptions,
  totalMonthly,
  currency,
  getCategoryLabel,
  isLoading,
  countryCode,
}: SubscriptionsCardProps) {
  return (
    <SectionCard
      title="Subscriptions"
      action={
        subscriptions.length > 0 && (
          <Link to="/subscriptions">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              View all
              <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        )
      }
    >
      <SubscriptionsList
        subscriptions={subscriptions}
        totalMonthly={totalMonthly}
        currency={currency}
        getCategoryLabel={getCategoryLabel}
        isLoading={isLoading}
        countryCode={countryCode}
      />
    </SectionCard>
  )
}
