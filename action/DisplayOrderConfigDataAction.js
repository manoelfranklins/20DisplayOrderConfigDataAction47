sap.ui.define([
    "sap/dm/dme/pod2/action/Action",
    "sap/dm/dme/pod2/context/PodContext",
    "sap/dm/dme/pod2/api/order/OrderPublicApiClient",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/ButtonType",
    "sap/m/Table",
    "sap/m/Column",
    "sap/m/ColumnListItem",
    "sap/m/Text",
    "sap/m/Label",
    "sap/m/Toolbar",
    "sap/m/ToolbarSpacer",
    "sap/m/SearchField",
    "sap/m/Title",
    "sap/m/MessageToast",
    "sap/m/BusyDialog",
    "sap/m/VBox",
    "sap/m/HBox",
    "sap/m/FlexJustifyContent",
    "sap/m/FlexAlignItems",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter"
], (
    Action,
    PodContext,
    OrderPublicApiClient,
    Dialog,
    Button,
    ButtonType,
    Table,
    Column,
    ColumnListItem,
    Text,
    Label,
    Toolbar,
    ToolbarSpacer,
    SearchField,
    Title,
    MessageToast,
    BusyDialog,
    VBox,
    HBox,
    FlexJustifyContent,
    FlexAlignItems,
    JSONModel,
    Filter,
    FilterOperator,
    Sorter
) => {
    "use strict";

    // Sort direction tracker (per dialog instance)
    const SORT_NONE = "None";
    const SORT_ASC  = "Ascending";
    const SORT_DESC = "Descending";

    class DisplayOrderConfigDataAction extends Action {

        static getDisplayName() {
            return "Display Order Config Data";
        }

        static getDescription() {
            return "Queries the order custom data (customValues) for the currently selected order and displays them in a searchable, sortable overlay popup.";
        }

        // ─── Main entry point ───────────────────────────────────────────────
        async execute(oActionContext) {
            // 1. Resolve order number from POD context (adaptive pattern)
            const sOrderNumber = this._resolveOrderNumber();
            if (!sOrderNumber) {
                MessageToast.show("No order selected. Please select a work list item first.");
                return;
            }

            const sPlant = PodContext.getPlant();
            if (!sPlant) {
                MessageToast.show("Plant not available in POD context.");
                return;
            }

            // 2. Show popup (starts in loading state)
            const { oDialog, oModel } = this._createDialog(sOrderNumber);
            oDialog.open();

            // 3. Fetch data and populate
            try {
                const aCustomValues = await this._fetchCustomValues(sPlant, sOrderNumber);
                oModel.setProperty("/customValues", aCustomValues);
                oModel.setProperty("/totalCount", aCustomValues.length);
                oModel.setProperty("/filteredCount", aCustomValues.length);
                oModel.setProperty("/loading", false);

                if (aCustomValues.length === 0) {
                    oModel.setProperty("/noDataText", "No custom configuration data found for this order.");
                }
            } catch (oError) {
                oModel.setProperty("/loading", false);
                oModel.setProperty("/noDataText", "Error loading data: " + (oError.message || "Unknown error"));
                oModel.setProperty("/customValues", []);
                console.error("[DisplayOrderConfigDataAction] fetch error:", oError);
            }
        }

        // ─── POD context helpers ─────────────────────────────────────────────
        _resolveOrderNumber() {
            // Adaptive pattern: try OperationActivity first, then WorkListItem
            const oOp = PodContext.getLastSelectedOperationActivity();
            const oWL = PodContext.getLastSelectedWorkListItem();

            let oItem = null;
            if (oOp && oWL) {
                oItem = oWL;
            } else if (oWL) {
                oItem = oWL;
            } else {
                const aItems = PodContext.getSelectedWorkListItems();
                oItem = Array.isArray(aItems) && aItems.length > 0 ? aItems[0] : null;
            }

            if (!oItem) return null;

            // Multiple property name variations across POD configurations
            return oItem.order
                || oItem.shopOrder
                || oItem.orderNumber
                || oItem.shopOrderRef?.order
                || oItem.shopOrderRef?.shopOrder
                || (typeof oItem.getOrder === "function" ? oItem.getOrder() : null)
                || null;
        }

        // ─── Data fetching ───────────────────────────────────────────────────
        async _fetchCustomValues(sPlant, sOrderNumber) {
            const oClient = new OrderPublicApiClient();
            const oResponse = await oClient.getOrder({ plant: sPlant, order: sOrderNumber });
            return this._parseCustomValues(oResponse?.customValues);
        }

        _parseCustomValues(oCustomValues) {
            const aResult = [];
            if (!oCustomValues) return aResult;

            if (Array.isArray(oCustomValues)) {
                oCustomValues.forEach(oItem => {
                    if (oItem.attribute !== undefined) {
                        aResult.push({
                            attribute: String(oItem.attribute ?? ""),
                            value:     String(oItem.value     ?? "")
                        });
                    } else if (typeof oItem === "object") {
                        Object.keys(oItem).forEach(sKey => {
                            aResult.push({ attribute: sKey, value: String(oItem[sKey] ?? "") });
                        });
                    }
                });
            } else if (typeof oCustomValues === "object") {
                Object.keys(oCustomValues).forEach(sKey => {
                    const vVal = oCustomValues[sKey];
                    aResult.push({
                        attribute: sKey,
                        value: typeof vVal === "object" && vVal !== null
                            ? JSON.stringify(vVal)
                            : String(vVal ?? "")
                    });
                });
            }

            return aResult;
        }

        // ─── Dialog construction ─────────────────────────────────────────────
        _createDialog(sOrderNumber) {
            const oModel = new JSONModel({
                orderNumber:    sOrderNumber,
                customValues:   [],
                totalCount:     0,
                filteredCount:  0,
                loading:        true,
                noDataText:     "Loading data, please wait…",
                sortAttribute:  SORT_NONE,
                sortValue:      SORT_NONE
            });

            // ── Search field ──────────────────────────────────────────────────
            const oSearchField = new SearchField({
                placeholder: "Search keys or values…",
                width: "260px",
                liveChange: oEvent => {
                    this._applySearch(oTable, oModel, oEvent.getParameter("newValue"));
                }
            });

            // ── Column sort buttons ───────────────────────────────────────────
            const oSortAttrBtn = new Button({
                text: "Attribute",
                icon: "sap-icon://sort",
                type: ButtonType.Transparent,
                press: () => this._cycleSortColumn(oTable, oModel, "attribute", "sortAttribute", "sortValue")
            }).addStyleClass("dca-sort-btn");

            const oSortValBtn = new Button({
                text: "Value",
                icon: "sap-icon://sort",
                type: ButtonType.Transparent,
                press: () => this._cycleSortColumn(oTable, oModel, "value", "sortValue", "sortAttribute")
            }).addStyleClass("dca-sort-btn");

            // ── Export button ─────────────────────────────────────────────────
            const oExportBtn = new Button({
                icon: "sap-icon://excel-attachment",
                text: "Export CSV",
                type: ButtonType.Transparent,
                press: () => this._exportCsv(oModel)
            });

            // ── Result count badge ────────────────────────────────────────────
            const oCountText = new Text({
                text: {
                    path: "/filteredCount",
                    formatter: n => (n === null || n === undefined) ? "" : `${n} entries`
                }
            }).addStyleClass("dca-count-text");

            // ── Header toolbar ────────────────────────────────────────────────
            const oToolbar = new Toolbar({
                content: [
                    oSearchField,
                    new ToolbarSpacer(),
                    oCountText,
                    oExportBtn
                ]
            });

            // ── Table ─────────────────────────────────────────────────────────
            const oTable = new Table({
                growing: true,
                growingThreshold: 100,
                sticky: ["ColumnHeaders", "HeaderToolbar"],
                noDataText: {
                    path: "/noDataText"
                },
                busyIndicatorDelay: 0,
                busy: {
                    path: "/loading"
                },
                headerToolbar: oToolbar,
                columns: [
                    new Column({
                        header: oSortAttrBtn,
                        width: "45%",
                        vAlign: "Middle"
                    }),
                    new Column({
                        header: oSortValBtn,
                        width: "55%",
                        vAlign: "Middle"
                    })
                ],
                items: {
                    path: "/customValues",
                    template: new ColumnListItem({
                        vAlign: "Middle",
                        cells: [
                            new Text({
                                text: "{attribute}",
                                wrapping: true
                            }).addStyleClass("dca-key-cell"),
                            new Text({
                                text: "{value}",
                                wrapping: true
                            }).addStyleClass("dca-val-cell")
                        ]
                    })
                }
            }).addStyleClass("dca-table");

            oTable.setModel(oModel);

            // Update filteredCount when binding changes
            const oBinding = oTable.getBinding("items");
            if (oBinding) {
                oBinding.attachChange(() => {
                    const iCount = oBinding.getLength ? oBinding.getLength() : oModel.getProperty("/customValues").length;
                    oModel.setProperty("/filteredCount", iCount);
                });
            }

            // ── Inject scoped CSS (once per session) ──────────────────────────
            this._injectStyles();

            // ── Dialog ────────────────────────────────────────────────────────
            const oDialog = new Dialog({
                title: `Order Custom Data — ${sOrderNumber}`,
                contentWidth: "720px",
                contentHeight: "560px",
                resizable: true,
                draggable: true,
                content: [
                    new VBox({
                        width: "100%",
                        height: "100%",
                        items: [oTable]
                    }).addStyleClass("dca-content-box")
                ],
                endButton: new Button({
                    text: "Close",
                    type: ButtonType.Emphasized,
                    press: () => oDialog.close()
                }),
                afterClose: () => oDialog.destroy()
            }).addStyleClass("dca-dialog");

            oDialog.setModel(oModel);

            return { oDialog, oModel };
        }

        // ─── Search ───────────────────────────────────────────────────────────
        _applySearch(oTable, oModel, sQuery) {
            const oBinding = oTable.getBinding("items");
            if (!oBinding) return;

            const aFilters = [];
            if (sQuery && sQuery.trim().length > 0) {
                aFilters.push(new Filter({
                    filters: [
                        new Filter("attribute", FilterOperator.Contains, sQuery),
                        new Filter("value",     FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }
            oBinding.filter(aFilters);

            // Update count after filter settles
            const iCount = oBinding.getLength ? oBinding.getLength() : oModel.getProperty("/customValues").length;
            oModel.setProperty("/filteredCount", iCount);
        }

        // ─── Sort ─────────────────────────────────────────────────────────────
        _cycleSortColumn(oTable, oModel, sField, sPropOwn, sPropOther) {
            const sCurrent = oModel.getProperty("/" + sPropOwn);
            let sNext;
            if      (sCurrent === SORT_NONE) sNext = SORT_ASC;
            else if (sCurrent === SORT_ASC)  sNext = SORT_DESC;
            else                             sNext = SORT_NONE;

            oModel.setProperty("/" + sPropOwn,   sNext);
            oModel.setProperty("/" + sPropOther, SORT_NONE);   // reset other column

            const oBinding = oTable.getBinding("items");
            if (!oBinding) return;

            if (sNext === SORT_NONE) {
                oBinding.sort([]);
            } else {
                oBinding.sort(new Sorter(sField, sNext === SORT_DESC));
            }
        }

        // ─── CSV Export ───────────────────────────────────────────────────────
        _exportCsv(oModel) {
            const aData        = oModel.getProperty("/customValues") || [];
            const sOrderNumber = oModel.getProperty("/orderNumber")  || "export";

            if (aData.length === 0) {
                MessageToast.show("No data to export.");
                return;
            }

            let sCsv = "Attribute,Value\n";
            aData.forEach(oRow => {
                sCsv += `${this._escapeCsv(oRow.attribute)},${this._escapeCsv(oRow.value)}\n`;
            });

            const sDate    = new Date().toISOString().slice(0, 10);
            const sFile    = `OrderCustomData_${sOrderNumber}_${sDate}.csv`;
            const oBlob    = new Blob(["﻿" + sCsv], { type: "text/csv;charset=utf-8;" });
            const oLink    = document.createElement("a");
            const sUrl     = URL.createObjectURL(oBlob);

            oLink.setAttribute("href", sUrl);
            oLink.setAttribute("download", sFile);
            oLink.style.visibility = "hidden";
            document.body.appendChild(oLink);
            oLink.click();
            document.body.removeChild(oLink);
            URL.revokeObjectURL(sUrl);

            MessageToast.show(`Exported ${aData.length} rows → ${sFile}`);
        }

        _escapeCsv(sValue) {
            if (!sValue) return "";
            let s = String(sValue);
            // Prefix formula-injection trigger characters so spreadsheets treat
            // the cell as plain text rather than executing it as a formula.
            if (/^[=+\-@\t\r]/.test(s)) {
                s = "'" + s;
            }
            if (s.includes(",") || s.includes("\n") || s.includes('"') || s.includes("'")) {
                return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
        }

        // ─── Scoped CSS injection ─────────────────────────────────────────────
        _injectStyles() {
            const sId = "dca-styles";
            if (document.getElementById(sId)) return;   // already injected

            const oStyle = document.createElement("style");
            oStyle.id    = sId;
            oStyle.textContent = `
/* ── DisplayOrderConfigDataAction overlay styles ── */

.dca-dialog .sapMDialogTitle {
    font-size: 1rem;
    font-weight: 600;
    color: #32363a;
}

.dca-content-box {
    padding: 0;
    height: 100%;
}

.dca-table {
    width: 100%;
    border-top: 1px solid #e5e5e5;
}

.dca-table .sapMListTblHeader {
    background: #f5f6f7;
    position: sticky;
    top: 0;
    z-index: 10;
}

.dca-table .sapMListTblRow:nth-child(even) {
    background-color: #fafafa;
}

.dca-table .sapMListTblRow:hover {
    background-color: #e8f3ff !important;
    transition: background-color 0.15s ease;
}

.dca-table .sapMListTblCell {
    border-bottom: 1px solid #f0f0f0;
    padding: 8px 12px;
    vertical-align: top;
}

.dca-key-cell {
    font-weight: 500;
    color: #0a6ed1;
    font-family: "72Mono", monospace, sans-serif;
    font-size: 0.8125rem;
    word-break: break-all;
}

.dca-val-cell {
    color: #32363a;
    font-size: 0.875rem;
    word-break: break-word;
}

.dca-sort-btn {
    font-weight: 600 !important;
}

.dca-count-text {
    color: #6a6d70;
    font-size: 0.8125rem;
    align-self: center;
    margin-right: 8px;
}

/* Search field focus glow */
.dca-dialog .sapMSF:focus-within {
    box-shadow: 0 0 0 2px #0a6ed1 !important;
    border-radius: 4px;
}

/* Busy overlay */
.dca-table .sapUiBusyIndicator {
    background: rgba(255,255,255,0.75);
}

/* Dialog close button */
.dca-dialog .sapMDialogFooter .sapMBtnEmphasized {
    min-width: 80px;
}
`;
            document.head.appendChild(oStyle);
        }
    }

    return DisplayOrderConfigDataAction;
});
