import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  FileBarChart,
  FileText,
  Wallet,
  Building2,
  TrendingUp,
  MessageSquare,
  Settings,
  Repeat,
  Shield,
  Landmark,
  ClipboardCheck,
  MessageSquareText,
  PiggyBank,
} from 'lucide-react'

export interface NavItem {
  title: string
  icon: LucideIcon
  href: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

const bankMessagesNavItem: NavItem = {
  title: 'Bank Messages',
  icon: MessageSquareText,
  href: '/bank-messages',
}

export const askPennyNavItem: NavItem = {
  title: 'Ask Penny',
  icon: MessageSquare,
  href: '/chat',
}

export const settingsNavItem: NavItem = {
  title: 'Settings',
  icon: Settings,
  href: '/settings',
}

/** Sidebar groups. Bank Messages only appears once reading bank messages is switched on. */
export function getNavGroups(smsEnabled: boolean): NavGroup[] {
  return [
    {
      label: 'Overview',
      items: [
        { title: 'Dashboard', icon: LayoutDashboard, href: '/' },
        { title: 'Reports', icon: FileBarChart, href: '/reports' },
      ],
    },
    {
      label: 'Money',
      items: [
        { title: 'Transactions', icon: Wallet, href: '/transactions' },
        { title: 'Budgets', icon: PiggyBank, href: '/budgets' },
        { title: 'Accounts', icon: Building2, href: '/accounts' },
        { title: 'Subscriptions', icon: Repeat, href: '/subscriptions' },
      ],
    },
    {
      label: 'Wealth',
      items: [
        { title: 'Investments', icon: TrendingUp, href: '/investments' },
        { title: 'Loans', icon: Landmark, href: '/loans' },
        { title: 'Insurance', icon: Shield, href: '/insurance' },
      ],
    },
    {
      label: 'Data',
      items: [
        { title: 'Statements', icon: FileText, href: '/statements' },
        ...(smsEnabled ? [bankMessagesNavItem] : []),
        { title: 'Review', icon: ClipboardCheck, href: '/review' },
      ],
    },
  ]
}
