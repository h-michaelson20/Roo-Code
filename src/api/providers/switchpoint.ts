import { ApiHandlerOptions } from "../../shared/api"
import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"
import { ApiStream } from "../transform/stream"
import { convertToOpenAiMessages } from "../transform/openai-format.js"
import { Anthropic } from "@anthropic-ai/sdk"

// Switchpoint AI API URL and model configuration
const SWITCHPOINT_API_URL = "https://www.switchpoint.dev/v1/chat/completions"

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

	// Override createMessage to handle streaming responses
	override async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		console.log("[SwitchpointHandler] Creating message with system prompt")

		try {
			// Format messages properly including system prompt and user messages
			const formattedMessages = [
				{ role: "system", content: systemPrompt },
				...convertToOpenAiMessages(messages).map((msg) => ({
					role: msg.role,
					content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
				})),
			]

			// Log payload being sent
			const payload = {
				model: "switchpoint-router", // or your provisioned model
				messages: formattedMessages,
				stream: true,
			}

			console.log("[SwitchpointHandler] Formatted messages:", JSON.stringify(formattedMessages, null, 2))
			console.log("[SwitchpointHandler] Sending request to:", SWITCHPOINT_API_URL)
			console.log("[SwitchpointHandler] Request payload:", JSON.stringify(payload, null, 2))

			const response = await fetch(SWITCHPOINT_API_URL, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.options.apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			})

			console.log("[SwitchpointHandler] Response status:", response.status)
			console.log("[SwitchpointHandler] Response headers:", {
				"content-type": response.headers.get("content-type"),
				"content-length": response.headers.get("content-length"),
				"transfer-encoding": response.headers.get("transfer-encoding"),
			})

			if (!response.body) throw new Error("No response body")

			console.log("[SwitchpointHandler] Starting to read stream...")

			const reader = response.body.getReader()
			const decoder = new TextDecoder()
			let buffer = ""
			let usage: any = null
			let cost: any = null

			while (true) {
				const { done, value } = await reader.read()
				console.log("[SwitchpointHandler] Stream read:", { done, valueLength: value?.length })
				if (done) break
				buffer += decoder.decode(value, { stream: true })
				console.log("[SwitchpointHandler] Current buffer:", buffer)
				const lines = buffer.split("\n")
				buffer = lines.pop() || ""
				for (const line of lines) {
					console.log("[SwitchpointHandler] Processing line:", line)
					if (!line.startsWith("data: ")) continue
					const data = line.slice(6)
					if (data === "[DONE]") return
					try {
						const parsed = JSON.parse(data)
						console.log("[SwitchpointHandler] Parsed chunk:", JSON.stringify(parsed, null, 2))
						if (parsed.type === "content" && typeof parsed.text === "string") {
							yield { type: "text", text: parsed.text }
						} else if (parsed.choices?.[0]?.delta?.content) {
							yield { type: "text", text: parsed.choices[0].delta.content }
						} else if (parsed.choices?.[0]?.message?.content) {
							yield { type: "text", text: parsed.choices[0].message.content }
						} else if (typeof parsed.content === "string") {
							yield { type: "text", text: parsed.content }
						} else {
							console.log("[SwitchpointHandler] Unknown chunk format:", JSON.stringify(parsed, null, 2))
						}
						if (parsed.usage) {
							usage = parsed.usage
						}
						if (parsed.cost) {
							cost = parsed.cost
						}
					} catch (e) {
						console.error("[SwitchpointHandler] Error parsing stream chunk:", e, data)
						console.error("[SwitchpointHandler] Raw data that failed to parse:", data)
					}
				}
			}

			console.log("[SwitchpointHandler] Stream completed. Usage:", usage, "Cost:", cost)

			// Yield final usage metrics with cost
			if (usage || cost) {
				yield {
					type: "usage",
					inputTokens: usage?.prompt_tokens || 0,
					outputTokens: usage?.completion_tokens || 0,
					totalCost: cost ?? usage?.cost ?? 0,
				}
			}
		} catch (error: any) {
			let errorMessage = "Unknown error occurred"

			if (error instanceof Response) {
				errorMessage = `Server error ${error.status}: ${await error.text()}`
			} else {
				errorMessage = `Error: ${error.message}`
			}

			console.error("[SwitchpointHandler] Error in createMessage:", errorMessage)
			throw new Error(`Switchpoint API error: ${errorMessage}`)
		}
	}
}
