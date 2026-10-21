import { App, PluginSettingTab, Setting } from 'obsidian';
import type HoveredTocPlugin from './main';
import { BUTTON_POSITIONS, STICKY_MODES, type ButtonPosition, type StickyMode } from './settings';

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

	display(): void {
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
					this.display();
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
