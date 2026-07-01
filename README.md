# Display Order Config Data Action

A POD 2.0 custom action that queries order custom data (`customValues`) for the currently selected order and displays it in a beautiful, searchable, sortable overlay popup modal.

## Overview

When assigned to a button in Manage PODs 2.0 app, this Action reads the selected order from the POD work list, calls the SAP DM Order API, and opens a polished dialog showing all custom key/value pairs configured on that order.

## Features

- **Overlay popup dialog** — resizable and draggable, 720 × 560 px default size
- **Live search** — filters both the key (attribute) and value columns simultaneously as you type
- **Column sorting** — click either column header to cycle through None → Ascending → Descending
- **Entry counter** — live badge showing how many entries match the current search filter
- **CSV export** — downloads a UTF-8 BOM CSV file named `OrderCustomData_<order>_<date>.csv` with proper escaping
- **Busy indicator** — spinner while the API call is in flight
- **Zebra-striped rows** — alternating row colors and hover highlight for readability
- **Monospace key column** — attribute names rendered in monospace with SAP blue for quick scanning
- **Memory-safe** — dialog is destroyed on close, no subscriptions leak

## File Structure

```
20displayConfigAction/
├── extension.json                           # Plugin registration
├── action/
│   └── DisplayOrderConfigDataAction.js      # Action implementation
├── i18n/
│   ├── i18n_en.properties                   # English
│   ├── i18n_de.properties                   # German
│   ├── i18n_zh.properties                   # Chinese Simplified
│   └── i18n_ja.properties                   # Japanese
├── DisplayOrderConfigDataAction_deployment.zip
└── README.md
```

## 🚀 Installation

1. Download `DisplayOrderConfigDataAction_deployment.zip` 
2. Navigate to **Manage PODs 2.0** app
3. Go to **Extensions** tab
4. Click **Create**
5. Fill in:
   - **Name**: Order Configuration Data (or your preferred name)
   - **Namespace**: `custom/orderconfigdata`
   - **Source Code**: Browse and Select the ZIP file
6. Click **Upload**

## Configuration in Manage PODs 2.0 app

1. Open your POD in **Manage PODs 2.0 app**
2. Select the button you want to trigger this action, ex: 'Start' button
3. In the button's **Action** property, search for **"Display Order Config Data"**
4. Assign it — no further configuration is required

## Usage

1. In the POD runtime, select a work list item (SFC/order)
2. Press the configured (Start) button
3. The **Order Custom Data** popup opens, showing all `customValues` from the order
4. Use the **search field** to filter entries
5. Click **Attribute** or **Value** column headers to sort
6. Click **Export CSV** to download the data
7. Click **Close** to dismiss

## API Used

| API Client | Method | Parameters |
|---|---|---|
| `OrderPublicApiClient` | `getOrder()` | `{ plant, order }` |

The action reads `customValues` from the order response. Both array format (`[{attribute, value}]`) and object format (`{key: value}`) are handled automatically.

## POD Context Compatibility

The action works in all POD configurations using an adaptive selection pattern:

| POD Configuration | Behaviour |
|---|---|
| OperationActivity + WorkList | Reads order from WorkList item |
| WorkList only | Reads order from WorkList item |
| Neither widget present | Shows "No order selected" toast |

Order number is resolved from multiple property name variants (`order`, `shopOrder`, `orderNumber`, `shopOrderRef.order`) to handle different POD setups.

## Technical Details

- **Base class:** `sap/dm/dme/pod2/action/Action`
- **Namespace:** `custom/displayconfigaction`
- **Module path:** `custom/displayconfigaction/action/DisplayOrderConfigDataAction`
- **Type:** `custom.displayconfigaction.action.DisplayOrderConfigDataAction`

## License
This project is licensed under the MIT License - see the LICENSE file for details.

## 👨‍💻 Author
Manoel Costa http://manoelcosta.com/

Disclaimer: This is a community extension and is not officially supported by SAP. Use at your own discretion.
