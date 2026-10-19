/**
 * Chat message list component
 */

import { forwardRef } from 'react'
import { AlertCircle } from 'lucide-react'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AssistantMessage } from './assistant-message'
import type { UIMessage } from './types'
import { ChatColumn } from './chat-column'

interface StreamState {
  steps: Array<{
    type: string
    content?: string
    toolCallId?: string
    toolName?: string
    args?: unknown
  }>
  currentText: string
  currentReasoning: string
  isLoading: boolean
  toolCalls: Map<string, { result?: unknown }>
  error: string | null
}

interface ChatMessageListProps {
  messages: UIMessage[]
  isReasoningStreaming: boolean
  streamState: StreamState
  onToolCallClick: (toolName: string, args: unknown, result: unknown) => void
}

export const ChatMessageList = forwardRef<HTMLDivElement, ChatMessageListProps>(
  function ChatMessageList({ messages, isReasoningStreaming, streamState, onToolCallClick }, ref) {
    const hasStreamingContent = streamState.steps.length > 0 || streamState.currentText
    const hasMessages = messages.length > 0 || hasStreamingContent

    // Empty state is now handled by ChatWelcome component in chat.tsx
    if (!hasMessages) {
      return <div ref={ref} />
    }

    return (
      <>
        {messages.map((message, msgIdx) => (
          <div key={message.id} className="space-y-4 animate-fade-in">
            {/* User message */}
            {message.role === 'user' && message.content && (
              <ChatColumn className="flex justify-end">
                <Message from="user">
                  <MessageContent>
                    <MessageResponse>{message.content}</MessageResponse>
                  </MessageContent>
                </Message>
              </ChatColumn>
            )}

            {/* Assistant message */}
            {message.role === 'assistant' && (
              <AssistantMessage
                message={message}
                isLastMessage={msgIdx === messages.length - 1}
                isReasoningStreaming={isReasoningStreaming}
                streamState={streamState}
                onToolCallClick={onToolCallClick}
              />
            )}
          </div>
        ))}

        {/* Error display */}
        {streamState.error && (
          <ChatColumn>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{streamState.error}</AlertDescription>
            </Alert>
          </ChatColumn>
        )}

        <div ref={ref} />
      </>
    )
  }
)
