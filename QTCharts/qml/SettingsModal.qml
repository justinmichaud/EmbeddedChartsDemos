import QtQuick
import QtQuick.Layouts
import QtQuick.Controls.Basic

Popup {
    id: root
    modal: true
    focus: true
    anchors.centerIn: parent
    width: 320
    padding: 0

    background: Rectangle {
        color: "#1a1f29"
        border.color: "#2d3748"
        border.width: 1
    }

    readonly property var currencies: ["USD", "EUR", "GBP", "JPY", "CNY", "CHF", "AUD", "CAD"]
    readonly property var chartCounts: [2, 4, 8, 14, 20, 30, 40, 50]

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        Rectangle {
            Layout.fillWidth: true
            implicitHeight: 28
            color: "transparent"
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: "#2d3748" }
            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 12
                anchors.rightMargin: 8
                Text {
                    text: "SETTINGS"
                    color: "#e6e8eb"; font.family: "monospace"; font.pixelSize: 11; font.bold: true
                    Layout.fillWidth: true
                }
                Text {
                    text: "✕"
                    color: closeMouse.containsMouse ? "#e6e8eb" : "#6b7280"
                    font.family: "monospace"; font.pixelSize: 12
                    MouseArea {
                        id: closeMouse
                        anchors.fill: parent
                        anchors.margins: -4
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.close()
                    }
                }
            }
        }

        ColumnLayout {
            Layout.fillWidth: true
            Layout.margins: 12
            spacing: 16

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text { text: "CURRENCY"; color: "#6b7280"; font.family: "monospace"; font.pixelSize: 9 }
                GridLayout {
                    Layout.fillWidth: true
                    columns: 4
                    columnSpacing: 4
                    rowSpacing: 4
                    Repeater {
                        model: root.currencies
                        delegate: ChoiceButton {
                            required property string modelData
                            Layout.fillWidth: true
                            text: modelData
                            selected: appModel.currency === modelData
                            onClicked: appModel.updateCurrency(modelData)
                        }
                    }
                }
            }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 4
                Text { text: "CHARTS DISPLAYED"; color: "#6b7280"; font.family: "monospace"; font.pixelSize: 9 }
                GridLayout {
                    Layout.fillWidth: true
                    columns: 8
                    columnSpacing: 4
                    rowSpacing: 4
                    Repeater {
                        model: root.chartCounts
                        delegate: ChoiceButton {
                            required property int modelData
                            Layout.fillWidth: true
                            text: modelData.toString()
                            selected: appModel.numCharts === modelData
                            onClicked: appModel.updateNumCharts(modelData)
                        }
                    }
                }
            }

            Rectangle {
                Layout.fillWidth: true
                implicitHeight: 24
                color: "transparent"
                border.width: 1
                border.color: "#ef4444"
                Text {
                    anchors.centerIn: parent
                    text: "CLEAR LOCAL STORAGE & RESET"
                    color: clearMouse.containsMouse ? "white" : "#ef4444"
                    font.family: "monospace"; font.pixelSize: 9
                }
                Rectangle {
                    anchors.fill: parent
                    color: "#ef4444"
                    visible: clearMouse.containsMouse
                    z: -1
                }
                MouseArea {
                    id: clearMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: { appModel.clearStorage(); root.close(); }
                }
            }
        }
    }

    component ChoiceButton: Rectangle {
        id: btn
        property string text: ""
        property bool selected: false
        signal clicked()
        implicitHeight: 22
        color: btn.selected ? "#1e3a5f" : "transparent"
        border.width: 1
        border.color: btn.selected
            ? "#3b82f6"
            : (mouse.containsMouse ? "#4b5563" : "#2d3748")
        Text {
            anchors.centerIn: parent
            text: btn.text
            color: btn.selected
                ? "#3b82f6"
                : (mouse.containsMouse ? "#9ca3af" : "#6b7280")
            font.family: "monospace"; font.pixelSize: 9
        }
        MouseArea {
            id: mouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: btn.clicked()
        }
    }
}
