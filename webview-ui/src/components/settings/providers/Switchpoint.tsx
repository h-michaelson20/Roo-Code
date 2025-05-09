import { useCallback } from "react"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { ApiConfiguration } from "@roo/shared/api"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"
import { inputEventTransform } from "../transforms"

type SwitchpointProps = {
	apiConfiguration: ApiConfiguration
	setApiConfigurationField: (field: keyof ApiConfiguration, value: ApiConfiguration[keyof ApiConfiguration]) => void
}

export const Switchpoint = ({ apiConfiguration, setApiConfigurationField }: SwitchpointProps) => {
	const { t } = useAppTranslation()

	const handleInputChange = useCallback(
		<K extends keyof ApiConfiguration, E>(
			field: K,
			transform: (event: E) => ApiConfiguration[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	return (
		<>
			<VSCodeTextField
				value={apiConfiguration?.switchpointApiKey || ""}
				type="password"
				onInput={handleInputChange("switchpointApiKey")}
				placeholder={t("settings:placeholders.apiKey")}
				className="w-full">
				<span className="font-medium">{t("settings:providers.switchpointApiKey")}</span>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				{t("settings:providers.apiKeyStorageNotice")}
			</div>
			{!apiConfiguration?.switchpointApiKey && (
				<VSCodeButtonLink href="https://switchpoint.dev" appearance="secondary">
					{t("settings:providers.getSwitchpointApiKey")}
				</VSCodeButtonLink>
			)}
		</>
	)
}
