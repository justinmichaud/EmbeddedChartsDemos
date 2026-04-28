import QtQuick
import QtQuick.Layouts

Item {
    id: root
    property string symbol: ""
    signal backClicked()

    readonly property var stock: appModel.stockBySymbol(symbol)

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 8
        spacing: 8

        RowLayout {
            Layout.fillWidth: true
            spacing: 12

            Rectangle {
                id: backBtn
                implicitHeight: 20; implicitWidth: 60
                color: "transparent"
                border.width: 1
                border.color: backMouse.containsMouse ? "#4b5563" : "#2d3748"
                Text {
                    anchors.centerIn: parent
                    text: "← BACK"
                    color: backMouse.containsMouse ? "#e6e8eb" : "#6b7280"
                    font.family: "monospace"; font.pixelSize: 10
                }
                MouseArea {
                    id: backMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.backClicked()
                }
            }
            Text {
                text: root.symbol + " — DETAIL VIEW"
                color: "#9ca3af"
                font.family: "monospace"; font.pixelSize: 11
                Layout.fillWidth: true
            }
        }

        StockChart {
            visible: root.stock !== null
            stock: root.stock
            currency: appModel.currency
            enlarged: true
            Layout.fillWidth: true
            Layout.preferredHeight: 480
        }
        Text {
            visible: root.stock === null
            text: "Waiting for data…"
            color: "#6b7280"
            font.family: "monospace"; font.pixelSize: 12
            Layout.alignment: Qt.AlignCenter
        }
    }
}
