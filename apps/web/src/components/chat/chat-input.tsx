/**
 * Chat input component
 */

import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
} from '@/components/ai-elements/prompt-input'
import { ModelSelector, ThinkingLevelSelector } from './model-selector'
import type { ThinkingLevel } from './types'
import { ChatColumn } from './chat-column'

interface ChatProvider {
  id: string
  name: string
  models: ChatModel[]
  isConfigured?: boolean
}

interface ChatModel {
  id: string
  name: string
  supportsThinking?: boolean
}

interface ChatInputProps {
  input: string
  onInputChange: (value: string) => void
  onSubmit: () => void
  isLoading: boolean
  onCancel: () => void
  providers: ChatProvider[]
  currentProvider: ChatProvider | undefined
  currentModel: ChatModel | undefined
  selectedProvider: string
  selectedModel: string
  onModelSelect: (providerId: string, modelId: string) => void
  thinkingLevel: ThinkingLevel
  onThinkingLevelChange: (level: ThinkingLevel) => void
}

export function ChatInput({
  input,
  onInputChange,
  onSubmit,
  isLoading,
  onCancel,
  providers,
  currentProvider,
  currentModel,
  selectedProvider,
  selectedModel,
  onModelSelect,
  thinkingLevel,
  onThinkingLevelChange,
}: ChatInputProps) {
  return (
    <div className="shrink-0">
      {/* Input container */}
      <div className="pt-2 pb-2 bg-background">
        <ChatColumn>
          <PromptInput onSubmit={onSubmit} className="rounded-xl border-border-subtle bg-card">
            <PromptInputTextarea
              placeholder="Ask about your finances..."
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              disabled={isLoading}
              className="min-h-14"
            />
            <PromptInputFooter className="gap-2 px-3 pb-3">
              <PromptInputTools className="min-w-0 flex-wrap gap-1">
                <ModelSelector
                  providers={providers}
                  currentProvider={currentProvider}
                  currentModel={currentModel}
                  selectedProvider={selectedProvider}
                  selectedModel={selectedModel}
                  onSelect={onModelSelect}
                />

                <ThinkingLevelSelector
                  level={thinkingLevel}
                  onChange={onThinkingLevelChange}
                  supportsThinking={currentModel?.supportsThinking || false}
                />
              </PromptInputTools>

              <PromptInputSubmit
                disabled={!input.trim() || isLoading}
                status={isLoading ? 'streaming' : undefined}
                onStop={onCancel}
              />
            </PromptInputFooter>
          </PromptInput>
          <p className="text-center text-xs text-muted-foreground mt-2">
            AI responses are for informational purposes only and should not be considered financial
            advice.
          </p>
        </ChatColumn>
      </div>
    </div>
  )
}
