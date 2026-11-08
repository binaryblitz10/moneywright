/**
 * Remembers which Ask Penny conversation was open, per profile, so coming back to the page
 * reopens it. Lives in sessionStorage: it lasts while the app window is open.
 */

const storageKey = (scope: string): string => `penny-last-conversation:${scope}`

export function getLastConversationId(scope: string): string | null {
  try {
    return sessionStorage.getItem(storageKey(scope))
  } catch {
    return null
  }
}

export function setLastConversationId(scope: string, conversationId: string | null): void {
  try {
    if (conversationId) sessionStorage.setItem(storageKey(scope), conversationId)
    else sessionStorage.removeItem(storageKey(scope))
  } catch {
    // Storage unavailable: the chat just opens as a new one next time
  }
}
