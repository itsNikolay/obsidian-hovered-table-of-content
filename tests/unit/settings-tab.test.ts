import { expect, test, vi } from 'vitest';
import type { App } from 'obsidian';
import type HoveredTocPlugin from '../../src/main';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { HoveredTocSettingTab } from '../../src/settings-tab';

vi.mock('obsidian', () => ({
	requireApiVersion: () => true,
	PluginSettingTab: class {
		refreshDomState = vi.fn();
	},
	Setting: class {},
}));

test('indexes every setting and keeps dependent controls discoverable', () => {
	const plugin = { settings: { ...DEFAULT_SETTINGS }, saveSettings: vi.fn() };
	const tab = new HoveredTocSettingTab({} as App, plugin as unknown as HoveredTocPlugin);
	const definitions = tab.getSettingDefinitions();
	expect(definitions).toHaveLength(Object.keys(DEFAULT_SETTINGS).length);
	const controls = definitions.flatMap((item) => 'control' in item && item.control ? [item.control] : []);
	expect(controls.map((control) => control.key).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
	const mode = controls.find((control) => control.key === 'stickyMode');
	expect(mode?.disabled).toBeTypeOf('function');
	plugin.settings.stickyHeadings = false;
	if (typeof mode?.disabled === 'function') expect(mode.disabled()).toBe(true);
});

test('declarative changes save and apply settings to open notes', async () => {
	const plugin = { settings: { ...DEFAULT_SETTINGS }, saveSettings: vi.fn().mockResolvedValue(undefined) };
	const tab = new HoveredTocSettingTab({} as App, plugin as unknown as HoveredTocPlugin);
	await tab.setControlValue('stickyHeadings', false);
	expect(plugin.settings.stickyHeadings).toBe(false);
	expect(plugin.saveSettings).toHaveBeenCalledOnce();
});
