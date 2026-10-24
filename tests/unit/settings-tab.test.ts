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
	const stickyNumbers = controls.find((control) => control.key === 'stickyNumbers');
	expect(stickyNumbers?.type).toBe('toggle');
	if (typeof stickyNumbers?.disabled === 'function') expect(stickyNumbers.disabled()).toBe(true);
	else expect.fail('numbers on sticky headings depend on sticky headings');
});

test('the number format is disabled only when nothing is numbered', () => {
	const plugin = { settings: { ...DEFAULT_SETTINGS }, saveSettings: vi.fn() };
	const tab = new HoveredTocSettingTab({} as App, plugin as unknown as HoveredTocPlugin);
	const format = tab.getSettingDefinitions().flatMap((item) => 'control' in item && item.control?.key === 'numberFormat' ? [item.control] : [])[0];
	if (typeof format?.disabled !== 'function') return expect.fail('the number format depends on the numbering settings');
	expect(format.disabled()).toBe(false);
	plugin.settings.headingNumbers = false;
	expect(format.disabled()).toBe(true);
	plugin.settings.stickyNumbers = true;
	expect(format.disabled()).toBe(false);
	plugin.settings.stickyHeadings = false;
	expect(format.disabled()).toBe(true);
});

test('declarative changes save and apply settings to open notes', async () => {
	const plugin = { settings: { ...DEFAULT_SETTINGS }, saveSettings: vi.fn().mockResolvedValue(undefined) };
	const tab = new HoveredTocSettingTab({} as App, plugin as unknown as HoveredTocPlugin);
	await tab.setControlValue('stickyHeadings', false);
	expect(plugin.settings.stickyHeadings).toBe(false);
	expect(plugin.saveSettings).toHaveBeenCalledOnce();
});
