import type { Transaction } from '@/lib/api'

export interface MerchantGroupData {
  key: string
  name: string
  transactions: Transaction[]
  /** Sum of credits minus debits */
  net: number
}

const mostCommon = (values: string[]): string => {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

/** Groups rows by merchant fingerprint (rows without one stand alone), biggest groups first */
export function groupByMerchant(transactions: Transaction[]): MerchantGroupData[] {
  const buckets = new Map<string, Transaction[]>()
  for (const t of transactions) {
    const key = t.merchantFingerprint ? `fp:${t.merchantFingerprint}` : `id:${t.id}`
    const bucket = buckets.get(key)
    if (bucket) bucket.push(t)
    else buckets.set(key, [t])
  }
  return [...buckets.entries()]
    .map(([key, rows]) => ({
      key,
      name: mostCommon(rows.map((t) => t.summary || t.originalDescription)),
      transactions: rows,
      net: rows.reduce((sum, t) => sum + (t.type === 'credit' ? t.amount : -t.amount), 0),
    }))
    .sort(
      (a, b) => b.transactions.length - a.transactions.length || Math.abs(b.net) - Math.abs(a.net)
    )
}
