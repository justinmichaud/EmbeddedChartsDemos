import QtQuick
import QtQuick.Layouts

Rectangle {
    id: root
    color: "#1a1f29"
    border.color: "#2d3748"
    border.width: 1
    implicitHeight: column.implicitHeight
    visible: appModel.headlines.length > 0

    ColumnLayout {
        id: column
        anchors.fill: parent
        spacing: 0

        Rectangle {
            Layout.fillWidth: true
            implicitHeight: 18
            color: "transparent"
            Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: "#2d3748" }
            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 8
                spacing: 8
                Text { text: "NEWSFEED"; color: "#3b82f6"; font.family: "monospace"; font.pixelSize: 9; font.bold: true }
                Text { text: "LIVE"; color: "#6b7280"; font.family: "monospace"; font.pixelSize: 8 }
            }
        }

        Repeater {
            model: 3
            delegate: Rectangle {
                id: row
                Layout.fillWidth: true
                implicitHeight: 20
                color: "transparent"
                required property int index
                readonly property int newsIdx: {
                    const h = appModel.headlines.length;
                    if (h === 0) return 0;
                    return (appModel.newsIndex - row.index + h) % h;
                }
                readonly property bool latest: row.index === 0

                Rectangle {
                    visible: row.index > 0
                    anchors.top: parent.top
                    width: parent.width
                    height: 1
                    color: "#2d3748"
                }

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 8
                    spacing: 8
                    Text {
                        text: row.latest ? "▶" : " "
                        color: row.latest ? "#e6e8eb" : "#6b7280"
                        font.family: "monospace"; font.pixelSize: 8
                    }
                    Text {
                        text: appModel.headlines.length > 0 ? appModel.headlines[row.newsIdx] : ""
                        color: row.latest ? "#d1d5db" : "#6b7280"
                        font.family: "monospace"; font.pixelSize: 9
                        Layout.fillWidth: true
                        elide: Text.ElideRight
                    }
                }
            }
        }
    }
}
