# LazyTabs

[中文](README.md) | [English](README.en.md)

![LazyTabs icon](public/icon/128.png)

Automatically organize Chrome tabs with custom rules.

When a tab is created or its URL changes, LazyTabs moves pages that match your rules into the corresponding Chrome tab group. You can also organize all matching tabs already open in the current window (or in every window) at once.

## Features

- Match on hostname, full URL, or page title with five operators: contains, starts with, ends with, equals, and regex
- Each group can hold multiple rules; each rule can hold multiple conditions, and any single condition match places the tab in the group
- Set a name and color for each group, with an optional random color
- Enable or disable groups independently
- Pause or resume automatic grouping with one switch
- Organize the current window or all windows manually, even when automatic grouping is paused
- Collapse other groups after organizing, keeping the focused tab's group expanded
- Optionally move ungrouped tabs to the end of the window
- Light, dark, and system themes
- Export and import settings (JSON)
- Check for new versions from the settings page
- Skip pinned tabs and incognito tabs

## Installation

### Download from Releases

1. Open the [latest release](https://github.com/CuartPyaw/Lazytabs/releases/latest) and download `LazyTabs.zip`.
2. Extract the ZIP file.
3. Open `chrome://extensions`.
4. Turn on **Developer mode** in the top-right corner.
5. Click **Load unpacked**.
6. Select the extracted `LazyTabs` directory.

### Build and load the extension

```bash
npm install
npm run build
```

Then in Chrome:

1. Open `chrome://extensions`.
2. Turn on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the `.output/LazyTabs` directory in this project.

### Development mode

```bash
npm run dev
```

When the development build is running, reload the extension from `chrome://extensions` to apply updates.

## Quick start

1. Click the extension icon and open the settings page.
2. Add a group with a name and a tab group color.
3. Add matching rules to the group; each rule can contain multiple conditions, each made up of a field, an operator, and a value.
4. Save the group and keep both the group and **Automatic grouping** enabled.
5. Open or navigate to a matching page. The tab will be placed in the corresponding tab group.
6. Click **Organize tabs** in the popup to process tabs that are already open in the current window.

The extension also registers an **Organize current window** command with the default shortcut `Alt+O`. You can change it at `chrome://extensions/shortcuts`. The shortcut always organizes the current window only; the popup button's scope is set by the **General** options.

## Match conditions

Each condition consists of a match field, an operator, and a value.

Fields:

| Field | Description |
| --- | --- |
| Hostname | The page's hostname; only effective for HTTP(S) pages, case-insensitive |
| Full URL | The page's full address, case-sensitive |
| Page title | The tab title, case-sensitive |
| Page title (case-insensitive) | The tab title, case-insensitive |

Operators:

| Operator | Description |
| --- | --- |
| Contains | The field value contains the match value |
| Starts with | The field value starts with the match value |
| Ends with | The field value ends with the match value |
| Equals | The field value equals the match value |
| Regex | The match value is used as a regular expression |

Groups are validated when saved:

- Group names cannot be empty or duplicated
- At least one rule is required, and every condition needs a match value
- Regular expressions must be valid
- Enabled groups cannot contain conditions that could match at the same time

A group may contain multiple rules, and each rule may contain multiple conditions; matching any single condition is enough to place a tab in that group. Groups are matched in order, so avoid configuring different groups to cover the same matches.

## General options

- **Collapse other groups after organizing**: keeps only the focused tab's group expanded
- **Move ungrouped tabs after the last group**: moves tabs that match no group to the end of the window
- **Organize all windows**: when enabled, **Organize tabs** in the popup applies to every window instead of the current one

## Development

```bash
npm install
npm run dev
```

Common commands:

| Command | Description |
| --- | --- |
| `npm run dev` | Start the WXT development build |
| `npm run build` | Create a production build in `.output/LazyTabs` |
| `npm test` | Run the Vitest unit tests |
| `npm run typecheck` | Run the TypeScript type checker |

The project is built with TypeScript, React, WXT, and HeroUI. Core rule, settings, and tab-group logic lives in `src/lib/`; the popup and settings page live in `entrypoints/popup/` and `entrypoints/options/`.

## Permissions

- `storage`: store grouping rules and settings
- `tabs`: read tabs and their URLs and titles
- `tabGroups`: create, update, and reuse Chrome tab groups
- `https://api.github.com/*`: check for new versions from the settings page

## Feedback

For bugs, suggestions, or feature requests, please [open an issue](https://github.com/CuartPyaw/Lazytabs/issues).

## License

This project is licensed under the [MIT License](LICENSE).
