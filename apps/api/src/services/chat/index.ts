/**
 * Chat Service - Main Entry Point
 *
 * Exports all chat-related functionality for the AI financial assistant.
 */

// Types
export * from './types'

// Query Cache
export * from './query-cache'

// Tools
export { createTools, isTavilyConfigured } from './tools'

// Prompt
export { buildSystemPrompt } from './prompt'

// Agent
export { createChatAgent, streamAgentResponse, generateAgentResponse } from './agent'

// Conversations
export {
  listConversations,
  createConversation,
  getOrCreateConversation,
  getConversation,
  updateConversationTitle,
  generateConversationTitle,
  getConversationMessages,
  addMessage,
  updateMessage,
  deleteConversation,
  clearConversation,
  toStoredMessages,
  type ConversationResponse,
  type MessageResponse,
} from './conversations'
