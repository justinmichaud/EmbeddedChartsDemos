import QtQuick
import QtQuick.Layouts
import QtCharts

Rectangle {
    id: root
    color: "#1a1f29"
    border.color: "#2d3748"
    border.width: 1

    property var stock        // StockItem*
    property string currency: "USD"
    property bool enlarged: false
    signal clicked()

    implicitWidth: 160
    implicitHeight: enlarged ? 420 : 200

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        // Header row
        Rectangle {
            Layout.fillWidth: true
            implicitHeight: 22
            color: "transparent"
            border.width: 0
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: "#2d3748" }
            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 8
                anchors.rightMargin: 8
                Text {
                    text: stock ? stock.symbol : ""
                    color: "#e6e8eb"
                    font.family: "monospace"
                    font.pixelSize: 11
                    font.bold: true
                    Layout.fillWidth: true
                }
                Text {
                    text: stock ? (stock.change >= 0 ? "+" : "") + stock.change.toFixed(3) + "%" : ""
                    color: stock && stock.change >= 0 ? "#10b981" : "#ef4444"
                    font.family: "monospace"
                    font.pixelSize: 10
                    font.bold: true
                }
            }
        }

        // BID / MID / ASK / HIGH / LOW
        // Use static delegates with reactive text bindings rather than a
        // Repeater whose model literal references stock.* — that pattern
        // re-evaluates the array on every pricesChanged and destroys/recreates
        // every delegate at 5 Hz × 14 charts.
        Rectangle {
            Layout.fillWidth: true
            implicitHeight: 32
            color: "#0f1419"
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: "#2d3748" }
            RowLayout {
                anchors.fill: parent
                anchors.margins: 6
                spacing: 4

                component PriceCell: ColumnLayout {
                    id: cell
                    property string label
                    property string value
                    property color valueColor
                    Layout.fillWidth: true
                    spacing: 0
                    Text {
                        text: cell.label
                        color: "#6b7280"
                        font.family: "monospace"
                        font.pixelSize: 9
                    }
                    Text {
                        text: cell.value
                        color: cell.valueColor
                        font.family: "monospace"
                        font.pixelSize: 9
                        font.bold: true
                    }
                }

                PriceCell {
                    label: "BID"
                    value: stock ? stock.currentBid.toFixed(3) : ""
                    valueColor: "#ef4444"
                }
                PriceCell {
                    label: "MID"
                    value: stock ? stock.currentMid.toFixed(3) : ""
                    valueColor: "#e6e8eb"
                }
                PriceCell {
                    label: "ASK"
                    value: stock ? stock.currentAsk.toFixed(3) : ""
                    valueColor: "#10b981"
                }
                PriceCell {
                    label: "HIGH"
                    value: stock ? stock.high.toFixed(3) : ""
                    valueColor: "#9ca3af"
                }
                PriceCell {
                    label: "LOW"
                    value: stock ? stock.low.toFixed(3) : ""
                    valueColor: "#9ca3af"
                }
            }
        }

        // Chart
        ChartView {
            id: chart
            Layout.fillWidth: true
            Layout.fillHeight: true
            backgroundColor: "#0f1419"
            plotAreaColor: "#0f1419"
            // antialiasing: false — Qt Charts draws via QPainter into an FBO
            // per ChartView; MSAA on 14 of those at 5 Hz is the dominant CPU
            // cost. Lines look slightly harder but the framerate jump is large.
            antialiasing: false
            legend.visible: false
            margins.top: 4
            margins.bottom: 4
            margins.left: 4
            margins.right: 4
            animationOptions: ChartView.NoAnimation

            ValueAxis {
                id: axisX
                min: 0
                max: 59
                gridLineColor: "#2d3748"
                color: "#2d3748"
                labelsColor: "#6b7280"
                labelsFont.family: "monospace"
                labelsFont.pixelSize: 8
                visible: root.enlarged
                tickCount: 5
            }
            ValueAxis {
                id: axisY
                min: stock ? stock.yMin : 0
                max: stock ? stock.yMax : 1
                gridLineColor: "#2d3748"
                color: "#2d3748"
                labelsColor: "#6b7280"
                labelsFont.family: "monospace"
                labelsFont.pixelSize: 8
                tickCount: 4
                labelFormat: "%.2f"
                // Tick label re-layout on every range change is expensive in
                // QGraphicsScene; only show labels on the enlarged view.
                labelsVisible: root.enlarged
            }

            // Bid and ask drawn as two thin lines instead of an AreaSeries.
            // AreaSeries is a CPU polygon fill (no useOpenGL support) and is
            // by far the most expensive primitive on this chart; LineSeries
            // with useOpenGL renders via the dedicated GL line path and skips
            // the QGraphicsScene rasterizer entirely.
            LineSeries {
                id: askSeries
                axisX: axisX
                axisY: axisY
                color: "#10b981"
                width: 1
                useOpenGL: true
            }
            LineSeries {
                id: bidSeries
                axisX: axisX
                axisY: axisY
                color: "#ef4444"
                width: 1
                useOpenGL: true
            }
            LineSeries {
                id: midSeries
                axisX: axisX
                axisY: axisY
                color: "#3b82f6"
                width: root.enlarged ? 2 : 1
                useOpenGL: true
            }

            Connections {
                target: stock
                function onPointsChanged() {
                    if (!stock) return;
                    stock.replaceBid(bidSeries);
                    stock.replaceAsk(askSeries);
                    stock.replaceMid(midSeries);
                }
            }
            Component.onCompleted: {
                if (stock) {
                    stock.replaceBid(bidSeries);
                    stock.replaceAsk(askSeries);
                    stock.replaceMid(midSeries);
                }
            }
        }

        // Footer
        Rectangle {
            Layout.fillWidth: true
            implicitHeight: 18
            color: "transparent"
            Rectangle { anchors.top: parent.top; width: parent.width; height: 1; color: "#2d3748" }
            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 8
                anchors.rightMargin: 8
                spacing: 8
                Text {
                    text: "CCY: " + (stock ? root.currency : "")
                    color: "#9ca3af"; font.family: "monospace"; font.pixelSize: 8
                    Layout.fillWidth: true
                }
                Text {
                    text: stock ? "SPR: " + (stock.currentAsk - stock.currentBid).toFixed(4) : ""
                    color: "#9ca3af"; font.family: "monospace"; font.pixelSize: 8
                    Layout.fillWidth: true
                }
                Text {
                    text: "UPD: 5Hz"
                    color: "#9ca3af"; font.family: "monospace"; font.pixelSize: 8
                    Layout.fillWidth: true
                }
            }
        }
    }

    MouseArea {
        anchors.fill: parent
        onClicked: root.clicked()
        cursorShape: Qt.PointingHandCursor
    }
}
