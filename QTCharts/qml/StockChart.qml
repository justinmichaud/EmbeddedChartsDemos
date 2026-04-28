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
        Rectangle {
            Layout.fillWidth: true
            implicitHeight: 32
            color: "#0f1419"
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: "#2d3748" }
            RowLayout {
                anchors.fill: parent
                anchors.margins: 6
                spacing: 4
                Repeater {
                    model: [
                        { label: "BID", value: stock ? stock.currentBid.toFixed(3) : "", color: "#ef4444" },
                        { label: "MID", value: stock ? stock.currentMid.toFixed(3) : "", color: "#e6e8eb" },
                        { label: "ASK", value: stock ? stock.currentAsk.toFixed(3) : "", color: "#10b981" },
                        { label: "HIGH", value: stock ? stock.high.toFixed(3) : "", color: "#9ca3af" },
                        { label: "LOW", value: stock ? stock.low.toFixed(3) : "", color: "#9ca3af" },
                    ]
                    delegate: ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 0
                        Text {
                            text: modelData.label
                            color: "#6b7280"
                            font.family: "monospace"
                            font.pixelSize: 9
                        }
                        Text {
                            text: modelData.value
                            color: modelData.color
                            font.family: "monospace"
                            font.pixelSize: 9
                            font.bold: true
                        }
                    }
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
            antialiasing: true
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
            }

            // Bid/ask drawn as a single shaded band (matches the JS demo's
            // two-Area look). The upper/lower LineSeries supply the curve
            // envelopes; AreaSeries fills between them.
            AreaSeries {
                axisX: axisX
                axisY: axisY
                color: "#10b981"
                borderColor: "#10b981"
                borderWidth: 0
                opacity: 0.22
                upperSeries: LineSeries { id: askSeries }
                lowerSeries: LineSeries { id: bidSeries }
            }

            // Mid line, drawn on top of the band.
            LineSeries {
                id: midSeries
                axisX: axisX
                axisY: axisY
                color: "#3b82f6"
                width: root.enlarged ? 2 : 1.5
                useOpenGL: false
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
