import { describe, expect, test } from 'bun:test'
import { decryptBackup, encryptBackup } from './backup-crypto'

describe('backup encryption', () => {
  const data = new TextEncoder().encode('secret database bytes')

  test('round-trips with the right passphrase', async () => {
    const file = await encryptBackup(data, 'correct horse')
    expect(await decryptBackup(file, 'correct horse')).toEqual(data)
  })

  test('does not contain the plain data', async () => {
    const file = await encryptBackup(data, 'correct horse')
    expect(Buffer.from(file).includes(Buffer.from(data))).toBe(false)
  })

  test('rejects a wrong passphrase', async () => {
    const file = await encryptBackup(data, 'correct horse')
    await expect(decryptBackup(file, 'wrong horse')).rejects.toThrow()
  })

  test('rejects a file that is not a backup', async () => {
    await expect(decryptBackup(new Uint8Array(64), 'x')).rejects.toThrow()
  })
})
