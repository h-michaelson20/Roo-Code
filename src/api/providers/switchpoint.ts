import { ApiHandlerOptions } from "../../shared/api"
import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"
import { ApiStream } from "../transform/stream"
import { convertToOpenAiMessages } from "../transform/openai-format"
import { Anthropic } from "@anthropic-ai/sdk"

// Switchpoint AI API URL and model configuration
const SWITCHPOINT_API_URL = "https://symph-ai-chat.vercel.app/api/streamless-result"

// Define a simple model ID type for Switchpoint
type SwitchpointModelId = "switchpoint"

// Define model information
const switchpointModels: Record<SwitchpointModelId, any> = {
	switchpoint: {
		maxTokens: 16384,
		contextWindow: 32768,
		supportsPromptCache: false,
		supportsImages: false,
		supportsComputerUse: true,
	},
}

// Default model
const switchpointDefaultModelId: SwitchpointModelId = "switchpoint"

export class SwitchpointHandler extends BaseOpenAiCompatibleProvider<SwitchpointModelId> {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			providerName: "Switchpoint",
			baseURL: SWITCHPOINT_API_URL,
			apiKey: options.switchpointApiKey,
			defaultProviderModelId: switchpointDefaultModelId,
			providerModels: switchpointModels,
			defaultTemperature: 0.7,
		})
	}

	// Override createMessage to handle non-streaming responses
	override async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		try {
			// Format messages properly including system prompt and user messages
			const formattedMessages = [{ role: "system", content: systemPrompt }, ...convertToOpenAiMessages(messages)]

			// Log payload being sent
			const payload = { messages: formattedMessages }

			// Use fetch for API call since the API is non-streaming
			const response = await fetch(this.baseURL, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.options.apiKey}`,
					"Content-Type": "application/json",
					"X-Switchpoint-App": "roo-code",
				},
				body: JSON.stringify(payload),
			})

			if (!response.ok) {
				const errorText = await response.text()
				throw new Error(`HTTP error! Status: ${response.status} - ${errorText}`)
			}

			// Try parsing response as JSON
			let chatCompletion
			try {
				chatCompletion = await response.json()
			} catch (jsonError) {
				console.error("[SwitchpointHandler] Failed to parse JSON response:", jsonError)
				const responseText = await response.text()
				console.log("[SwitchpointHandler] Raw response first 200 chars:", responseText.slice(0, 200))
				throw new Error(`Failed to parse response as JSON: ${jsonError.message}`)
			}

			// Check if response has the expected format
			if (
				!chatCompletion ||
				!chatCompletion.choices ||
				!chatCompletion.choices[0] ||
				!chatCompletion.choices[0].message ||
				!chatCompletion.choices[0].message.content
			) {
				throw new Error("Invalid response format from API")
			}

			// Get the message content from the response
			const content = chatCompletion.choices[0].message.content

			// Since it's not streamed but we need to implement a streaming interface,
			// we'll break the text into chunks to simulate streaming
			// This helps with UI responsiveness
			const chunkSize = 20 // characters per chunk
			for (let i = 0; i < content.length; i += chunkSize) {
				yield {
					type: "text",
					text: content.substring(i, Math.min(i + chunkSize, content.length)),
				}

				// Add a small delay to simulate streaming and improve UI responsiveness
				await new Promise((resolve) => setTimeout(resolve, 5))
			}

			// Yield end of stream usage metrics
			yield {
				type: "usage",
				inputTokens: 0, // Placeholder values
				outputTokens: 0,
			}
		} catch (error: any) {
			let errorMessage = "Unknown error occurred"

			if (error instanceof Response) {
				errorMessage = `Server error ${error.status}: ${await error.text()}`
			} else {
				errorMessage = `Error: ${error.message}`
			}

			throw new Error(`Switchpoint API error: ${errorMessage}`)
		}
	}
}
