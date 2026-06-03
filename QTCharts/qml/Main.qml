import QtQuick
import QtQuick.Controls.Basic
import QtQuick.Layouts
import QtQuick.Window

ApplicationWindow {
    id: window
    visible: true
    // Start maximized so the chart render area fills the screen, matching the
    // other demos — otherwise the fixed 1280x800 window renders far fewer chart
    // pixels and the FPS/memory numbers aren't comparable. width/height remain
    // the restored (un-maximize) size.
    visibility: Window.Maximized
    width: 1280
    height: 800
    title: "MKTTERM — Qt Charts Demo"
    color: "#0f1419"

    StackView {
        id: stack
        anchors.fill: parent
        initialItem: gridPage
    }

    Component {
        id: gridPage
        Item {
            ColumnLayout {
                anchors.fill: parent
                spacing: 8

                TopBar {
                    Layout.fillWidth: true
                    onSettingsClicked: settingsModal.open()
                    onRecoverClicked: stack.replace(gridPage)
                }

                NewsView {
                    Layout.fillWidth: true
                    Layout.leftMargin: 8
                    Layout.rightMargin: 8
                }

                ScrollView {
                    id: scroll
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.leftMargin: 8
                    Layout.rightMargin: 8
                    Layout.bottomMargin: 8
                    clip: true
                    contentWidth: availableWidth

                    StockGrid {
                        width: scroll.availableWidth
                        onStockClicked: function(symbol) {
                            stack.push(detailPage, { symbol: symbol })
                        }
                    }
                }
            }

            SweepOverlay {
                anchors.fill: parent
                sweepPos: appModel.sweepPos
            }
        }
    }

    Component {
        id: detailPage
        ChartDetail {
            onBackClicked: stack.pop()
        }
    }

    SettingsModal {
        id: settingsModal
    }
}
