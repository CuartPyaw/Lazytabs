# LazyTabs

[中文](README.md) | [English](README.en.md)

![LazyTabs icon](public/icon/128.png)

Automatically organize Chrome tabs by domain rules.

When a tab is created or its URL changes, LazyTabs moves pages that match your rules into the corresponding Chrome tab group. You can also organize all matching tabs already open in the current window at once.

## Features

- Match exact domains or one-level subdomain wildcards
- Set a name, color, and multiple rules for each group
- Enable or disable groups independently
- Pause or resume automatic grouping with one switch
- Organize the current window manually, even when automatic grouping is paused
- Skip pinned tabs, incognito tabs, and non-HTTP(S) pages

## Installation

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
2. Add a group with a name, tab group color, and domain rules.
3. Add one rule per line; save the group and keep both the group and **Automatic grouping** enabled.
4. Open or navigate to a matching page. The tab will be placed in the corresponding tab group.
5. Click **Organize current window** in the popup to process matching tabs that are already open.

The extension also registers an **Organize current window** command with the default shortcut `Alt+O`. You can change it at `chrome://extensions/shortcuts`.

## Rule semantics

| Rule | Matches | Does not match |
| --- | --- | --- |
| `github.com` | `github.com` | `api.github.com` |
| `*.github.com` | `api.github.com` | `github.com`, `api.v1.github.com` |

Rules are trimmed, converted to lowercase, and normalized by removing a trailing `.`. Only complete domains and one-level subdomain wildcards beginning with `*.` are supported.

Groups are validated when saved:

- Group names cannot be empty or duplicated
- Rules may contain only letters, numbers, hyphens, dots, and `*`
- Enabled groups cannot contain overlapping rules

A group may contain multiple rules; matching any one of them is enough to place a tab in that group. Rules are matched in group order, so avoid configuring different groups to cover the same domain.

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

The project is built with TypeScript, React, WXT, and HeroUI. Core rule and tab-group logic lives in `src/lib/`; the popup and settings page live in `entrypoints/popup/` and `entrypoints/options/`.

## Permissions

- `storage`: store grouping rules and enabled states
- `tabs`: read tabs in the current window and their URLs
- `tabGroups`: create, update, and reuse Chrome tab groups

## Feedback

For bugs, suggestions, or feature requests, please [open an issue](https://github.com/CuartPyaw/Lazytabs/issues).

## License

This project is licensed under the [MIT License](LICENSE).
