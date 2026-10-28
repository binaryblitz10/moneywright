import {
  AirplaneTilt,
  AppWindow,
  ArrowUUpLeft,
  ArrowsLeftRight,
  Bank,
  Barbell,
  Baby,
  Basket,
  Buildings,
  Coins,
  CreditCard,
  CurrencyCircleDollar,
  DeviceMobile,
  DotsThreeCircle,
  FilmSlate,
  ForkKnife,
  GasPump,
  Gift,
  Globe,
  GraduationCap,
  HandHeart,
  Heartbeat,
  House,
  Lightning,
  Money,
  PawPrint,
  Percent,
  Receipt,
  SealPercent,
  ShieldCheck,
  ShoppingBag,
  TrendUp,
  Wallet,
  type Icon,
} from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

const CATEGORY_ICONS: Record<string, Icon> = {
  food_dining: ForkKnife,
  groceries: Basket,
  shopping: ShoppingBag,
  utilities: Lightning,
  mobile_internet: DeviceMobile,
  phone_internet: DeviceMobile,
  emi: Bank,
  rent: House,
  mortgage: House,
  fuel: GasPump,
  gas: GasPump,
  entertainment: FilmSlate,
  travel: AirplaneTilt,
  healthcare: Heartbeat,
  personal_care: Barbell,
  gifts: Gift,
  education: GraduationCap,
  insurance: ShieldCheck,
  investment: TrendUp,
  software: AppWindow,
  transfer: ArrowsLeftRight,
  atm_withdrawal: Money,
  salary: Wallet,
  paycheck: Wallet,
  refund: ArrowUUpLeft,
  cashback: SealPercent,
  other_income: CurrencyCircleDollar,
  tax: Receipt,
  government: Buildings,
  charity: HandHeart,
  dividend: Coins,
  interest: Percent,
  credit_card_payment: CreditCard,
  bank_charges: Bank,
  forex: Globe,
  childcare: Baby,
  pet: PawPrint,
  other: DotsThreeCircle,
}

interface CategoryIconProps {
  /** Category code, e.g. "food_dining" */
  code: string
  /** Sizing and colour; the icon inherits the surrounding text colour */
  className?: string
}

/** Icon for a category, falling back to a generic one for unknown codes */
export function CategoryIcon({ code, className }: CategoryIconProps) {
  const Glyph = CATEGORY_ICONS[code] ?? DotsThreeCircle
  return <Glyph weight="fill" className={cn('h-3.5 w-3.5 shrink-0', className)} aria-hidden />
}
