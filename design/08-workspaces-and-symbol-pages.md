# 08 — Workspaces and symbol pages

Two ways to look at a market, decided 2026-11-23:

| | Symbol page | Chart tool |
|---|---|---|
| Address | One per symbol and source: `/quote/{source}/{ticker}` | One fixed address: `/chart` |
| Purpose | Quick look: price, change, candle or line chart, range stats | Analysis: any interval, smoothing, measuring, later several charts and drawings |
| Shareable | The link itself | A saved workspace (exported file now, server copy later) |
| Settings | A fixed small set | Everything, saved in the workspace |
| Data | Sources the server can reach (Massive, custom API, sample) | Any source, including files on this device |

Both use the same data pipeline and chart drawing code. Anything the symbol page doesn't offer is a button to the chart tool, so the two never become two different charting apps.

## 1. Workspaces (stage 1 implementation)

A **workspace** is a saved chart-tool window: a layout and the charts in it. Version 1 shows one chart, but the format already holds a list, so several charts are a new layout, not a new format.

```jsonc
{
  "format": "finaince.workspace",
  "version": 1,
  "id": "w-…",
  "name": "S&P 500 weekly",
  "createdAt": 1795459200000,
  "updatedAt": 1795459300000,
  "layout": { "kind": "single" },
  "charts": [
    { "id": "c-1", "spec": { /* ChartSpec v1, including spec.data */ } }
  ],
  "activeChartId": "c-1"
}
```

### 1.1 Data references

A chart stores **where its data comes from** (`ChartSpec.data`), not the bars:

| `data.kind` | Fields | On open |
|---|---|---|
| `local` | `datasetId`, `label` (file name) | Use the copy saved on this device. If it was deleted, ask for the file again. |
| `sample` | `sample: 'us500'` | Load the bundled sample. |
| `massive` | `ticker`, `multiplier`, `timespan`, `years` | Fetch fresh bars through the server. |
| `custom` | `endpoint`, `symbol` | Reserved for the custom API. |

`ChartSpec.datasetId` stays as the runtime binding to the loaded dataset and is re-resolved from `data` whenever a workspace opens. Keeping `data` inside the spec means undo and redo change the data reference and the binding together.

### 1.2 Storage and saving

- Workspaces live in IndexedDB (`finaince-workspaces`), next to the datasets. The last open workspace id is in `localStorage` (`finaince.lastWorkspace`).
- **Every workspace saves itself** about a second after each change, like an online document. There is no separate "save"; **Duplicate** gives a copy under a new name.
- **Export** writes the workspace as a `.finaince.json` file. It contains data references, not data: a chart that used a local file asks for the file when opened on another device.
- **Import** reads such a file. If a workspace with the same id exists, the import gets a new id, so nothing is overwritten.
- When accounts arrive, the same documents sync to the server.

### 1.3 Versions and upgrades

`parseWorkspace` validates any stored or imported document and upgrades older formats:

- the pre-workspace `localStorage` key `finaince.workspace` (a single `ChartSpec`) becomes an "Untitled workspace";
- unknown fields are dropped, missing fields get defaults (`DEFAULT_SPEC`);
- a newer `version` than the app knows is refused with a message, rather than half-read.

### 1.4 Opening the chart tool

1. A **hand-off** from another page (home chart, later symbol pages) wins. It is passed through `localStorage` (`finaince.handoff`, valid for one minute), not the address. The tool opens the workspace whose chart already uses the same data, or creates one, then applies the hand-off's range and chart type.
2. Otherwise the **last workspace** reopens.
3. With no workspaces, the **start screen** offers: load a file, the sample, Massive, or import a workspace file. When workspaces exist but none is open, it lists them first.

### 1.5 Workspaces menu

In the chart bar, after the logo: the workspace name (click to rename) and a menu with **New**, the list of workspaces (most recent first, each can be deleted), **Duplicate**, **Export file**, **Import file**.

## 2. Symbol pages (next)

- `/quote/{source}/{ticker}`, e.g. `/quote/massive/SPY`, `/quote/sample/US500`. Only for data the server can reach; uploaded files stay in the chart tool.
- Content: name, last price, change, "as of" time and source; range buttons; candle or line; volume; the range statistics.
- **Open in chart tool** hands off `{ data, range, chartType }` (§1.4).
- Data is fetched and cached by the server (about a minute for intraday, longer for daily) to respect Massive's rate limits. Massive's ticker-details endpoint supplies the company name. Check Massive's terms for public display first.
- The home page chart becomes the S&P 500 symbol view.

## 3. Equity search (after symbol pages)

Search by ticker or name (Massive's ticker reference endpoint); results link to symbol pages.

## 4. Multi-chart (later)

The format is ready (`charts[]`, `layout`). The work is in chart-mode state that is still global today: visible range, stats, hover, last bar, the "bars shown" note, the settings panel. Each moves to per-chart state, and layouts (`split-h`, `split-v`, `grid`) plus links (crosshair, time range) are added to the workspace.
