import {
	Container,
	type SelectItem,
	SelectList,
	type SettingItem,
	SettingsList,
	Spacer,
	Text,
} from "@mariozechner/pi-tui";
import type { AcademicTaskType, LeadAgentModel, ThinkingLevel } from "../../../index.js";
import { createLeadSelectListTheme, createLeadSettingsListTheme, type LeadTuiTheme } from "../theme.js";

const TASK_TYPE_VALUES = ["auto", "writing", "research", "review", "revision", "methods", "citation"] as const;
const PROFILE_VALUES = [
	"auto",
	"literature-searcher",
	"researcher",
	"reviewer",
	"writer",
	"reviser",
	"method-auditor",
	"citation-checker",
] as const;
const EXPECTED_OUTPUT_VALUES = [
	"none",
	"literature-search-results",
	"evidence-table",
	"review memo",
	"citation audit",
	"revision plan",
	"manuscript draft",
] as const;
const THINKING_VALUES = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

export interface LeadSettingsSelectorConfig {
	taskType?: AcademicTaskType;
	profileId?: string;
	expectedOutputs: readonly string[];
	model?: LeadAgentModel;
	availableModels: readonly LeadAgentModel[];
	thinkingLevel?: ThinkingLevel;
}

export interface LeadSettingsSelectorCallbacks {
	onTaskTypeChange: (taskType: AcademicTaskType | undefined) => void;
	onProfileChange: (profileId: string | undefined) => void;
	onExpectedOutputsChange: (expectedOutputs: string[]) => void;
	onModelChange: (model: LeadAgentModel) => void;
	onThinkingLevelChange: (level: ThinkingLevel) => void;
	onCancel: () => void;
}

function modelValue(model: LeadAgentModel | undefined): string {
	return model ? `${model.provider}/${model.id}` : "default";
}

function modelItems(models: readonly LeadAgentModel[]): SelectItem[] {
	return models.map((model) => ({
		value: modelValue(model),
		label: modelValue(model),
		description: model.name ?? model.provider,
	}));
}

class LeadSettingsSelectSubmenu extends Container {
	private readonly selectList: SelectList;

	constructor(
		title: string,
		description: string,
		items: SelectItem[],
		currentValue: string,
		theme: LeadTuiTheme,
		onSelect: (value: string) => void,
		onCancel: () => void,
	) {
		super();

		this.addChild(new Text(theme.accent(title), 0, 0));
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.muted(description), 0, 0));
		this.addChild(new Spacer(1));

		this.selectList = new SelectList(items, Math.min(items.length, 10), createLeadSelectListTheme(), {
			minPrimaryColumnWidth: 18,
			maxPrimaryColumnWidth: 48,
		});
		const currentIndex = items.findIndex((item) => item.value === currentValue);
		if (currentIndex >= 0) {
			this.selectList.setSelectedIndex(currentIndex);
		}
		this.selectList.onSelect = (item) => onSelect(item.value);
		this.selectList.onCancel = onCancel;
		this.addChild(this.selectList);

		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.dim("Enter to select - Esc to go back"), 0, 0));
	}

	handleInput(data: string): void {
		this.selectList.handleInput(data);
	}
}

export class LeadSettingsSelectorComponent extends Container {
	private readonly settingsList: SettingsList;

	constructor(config: LeadSettingsSelectorConfig, callbacks: LeadSettingsSelectorCallbacks, theme: LeadTuiTheme) {
		super();

		const models = modelItems(config.availableModels);
		const expectedOutput = config.expectedOutputs.length > 0 ? config.expectedOutputs.join(", ") : "none";
		const items: SettingItem[] = [
			{
				id: "task-type",
				label: "Task type",
				description: "Lead-agent routing hint for the current session. Use auto for planner-led routing.",
				currentValue: config.taskType ?? "auto",
				values: [...TASK_TYPE_VALUES],
			},
			{
				id: "profile",
				label: "Worker profile",
				description: "Preferred worker profile for the current session. Use auto for lead-agent selection.",
				currentValue: config.profileId ?? "auto",
				values: [...PROFILE_VALUES],
			},
			{
				id: "expected-output",
				label: "Expected output",
				description: "Common expected output for the current session. Use /expected-output for custom values.",
				currentValue: expectedOutput,
				values: [...EXPECTED_OUTPUT_VALUES],
			},
			{
				id: "model",
				label: "Model",
				description: "Default model for lead-agent direct synthesis. Selection is saved to agent-host settings.",
				currentValue: modelValue(config.model),
				submenu:
					models.length > 0
						? (currentValue, done) =>
								new LeadSettingsSelectSubmenu(
									"Model",
									"Select the model used by lead-agent direct synthesis.",
									models,
									currentValue,
									theme,
									done,
									() => done(),
								)
						: undefined,
			},
			{
				id: "thinking",
				label: "Thinking",
				description:
					"Default thinking budget for lead-agent direct synthesis. Selection is saved to agent-host settings.",
				currentValue: config.thinkingLevel ?? "off",
				values: [...THINKING_VALUES],
			},
		];

		this.addChild(new Text(theme.accent("Lead Agent Settings"), 0, 0));
		this.addChild(new Spacer(1));
		this.settingsList = new SettingsList(
			items,
			Math.min(items.length, 10),
			createLeadSettingsListTheme(theme),
			(id, newValue) => {
				switch (id) {
					case "task-type":
						callbacks.onTaskTypeChange(newValue === "auto" ? undefined : (newValue as AcademicTaskType));
						break;
					case "profile":
						callbacks.onProfileChange(newValue === "auto" ? undefined : newValue);
						break;
					case "expected-output":
						callbacks.onExpectedOutputsChange(newValue === "none" ? [] : [newValue]);
						break;
					case "model": {
						const selectedModel = config.availableModels.find((model) => modelValue(model) === newValue);
						if (selectedModel) {
							callbacks.onModelChange(selectedModel);
						}
						break;
					}
					case "thinking":
						callbacks.onThinkingLevelChange(newValue as ThinkingLevel);
						break;
				}
			},
			callbacks.onCancel,
			{ enableSearch: false },
		);
		this.addChild(this.settingsList);
	}

	getSettingsList(): SettingsList {
		return this.settingsList;
	}

	handleInput(data: string): void {
		this.settingsList.handleInput(data);
	}
}
