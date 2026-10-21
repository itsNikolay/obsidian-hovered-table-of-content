import { App, PluginSettingTab, Setting, requireApiVersion, type SettingDefinitionControl } from 'obsidian';
import type HoveredTocPlugin from './main';
import { BUTTON_POSITIONS, STICKY_MODES, type ButtonPosition, type StickyMode, type HoveredTocSettings, DEFAULT_SETTINGS, normalizeSettings } from './settings';

const POSITION_LABELS: Record<ButtonPosition, string> = {
	'top-left': 'Top left',
	'top-center': 'Top center',
	'top-right': 'Top right',
	'bottom-left': 'Bottom left',
	'bottom-center': 'Bottom center',
	'bottom-right': 'Bottom right',
};

const STICKY_MODE_LABELS: Record<StickyMode, string> = {
	prev: 'Closest heading',
	path: 'Heading with its parents',
};

export class HoveredTocSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: HoveredTocPlugin,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionControl<keyof HoveredTocSettings>[] {
		const stickyDisabled = () => !this.plugin.settings.stickyHeadings;
		return [
			{ name: 'Icon position', desc: 'Where the table of contents icon sits in each note.',
				control: { type: 'dropdown', key: 'buttonPosition', options: POSITION_LABELS, defaultValue: DEFAULT_SETTINGS.buttonPosition } },
			{ name: 'Icon in notes', desc: 'Show the table of contents icon in each note.',
				control: { type: 'toggle', key: 'noteIcon', defaultValue: DEFAULT_SETTINGS.noteIcon } },
			{ name: 'Icons on links', desc: 'Show a table of contents icon next to links in previews and in page previews of notes.',
				control: { type: 'toggle', key: 'linkIcons', defaultValue: DEFAULT_SETTINGS.linkIcons } },
			{ name: 'Icons on links in notes', desc: 'Show a table of contents icon next to links to other notes in reading view and live preview.',
				control: { type: 'toggle', key: 'noteLinkIcons', defaultValue: DEFAULT_SETTINGS.noteLinkIcons } },
			{ name: 'Sticky headings', desc: 'Pin the headings of the current section at the top of the note.',
				control: { type: 'toggle', key: 'stickyHeadings', defaultValue: DEFAULT_SETTINGS.stickyHeadings } },
			{ name: 'Sticky heading mode', desc: 'Show only the closest heading above, or that heading together with its parents.',
				control: { type: 'dropdown', key: 'stickyMode', options: STICKY_MODE_LABELS, defaultValue: DEFAULT_SETTINGS.stickyMode, disabled: stickyDisabled } },
			{ name: 'Icons on sticky headings', desc: 'Show an icon with the subheadings next to each sticky heading.',
				control: { type: 'toggle', key: 'stickyIcons', defaultValue: DEFAULT_SETTINGS.stickyIcons, disabled: stickyDisabled } },
		];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		this.plugin.settings = normalizeSettings({ ...this.plugin.settings, [key]: value });
		await this.plugin.saveSettings();
		if (requireApiVersion('1.13.0')) this.refreshDomState();
	}

	// Obsidian before 1.13 uses this fallback; newer versions render the definitions above.
	display(): void {
		this.renderLegacy();
	}

	private renderLegacy(): void {
		const { containerEl } = this;
		containerEl.empty();
		const { settings } = this.plugin;

		new Setting(containerEl)
			.setName('Icon position')
			.setDesc('Where the table of contents icon sits in each note.')
			.addDropdown((dropdown) => {
				for (const position of BUTTON_POSITIONS) dropdown.addOption(position, POSITION_LABELS[position]);
				dropdown.setValue(settings.buttonPosition).onChange(async (value) => {
					settings.buttonPosition = value as ButtonPosition;
					await this.plugin.saveSettings();
				});
			});

		const iconToggle = (name: string, desc: string, key: 'noteIcon' | 'linkIcons' | 'noteLinkIcons' | 'stickyIcons') =>
			new Setting(containerEl)
				.setName(name)
				.setDesc(desc)
				.addToggle((toggle) =>
					toggle.setValue(settings[key]).onChange(async (value) => {
						settings[key] = value;
						await this.plugin.saveSettings();
					}),
				);
		iconToggle('Icon in notes', 'Show the table of contents icon in each note.', 'noteIcon');
		iconToggle('Icons on links', 'Show a table of contents icon next to links in previews and in page previews of notes.', 'linkIcons');
		iconToggle('Icons on links in notes', 'Show a table of contents icon next to links to other notes in reading view and live preview.', 'noteLinkIcons');

		new Setting(containerEl)
			.setName('Sticky headings')
			.setDesc('Pin the headings of the current section at the top of the note.')
			.addToggle((toggle) =>
				toggle.setValue(settings.stickyHeadings).onChange(async (value) => {
					settings.stickyHeadings = value;
					await this.plugin.saveSettings();
					this.renderLegacy();
				}),
			);

		if (settings.stickyHeadings) {
			new Setting(containerEl)
				.setName('Sticky heading mode')
				.setDesc('Show only the closest heading above, or that heading together with its parents.')
				.addDropdown((dropdown) => {
					for (const mode of STICKY_MODES) dropdown.addOption(mode, STICKY_MODE_LABELS[mode]);
					dropdown.setValue(settings.stickyMode).onChange(async (value) => {
						settings.stickyMode = value as StickyMode;
						await this.plugin.saveSettings();
					});
				});
			iconToggle('Icons on sticky headings', 'Show an icon with the subheadings next to each sticky heading.', 'stickyIcons');
		}
	}
}
