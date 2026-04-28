import QtQuick
import QtQuick.Layouts
import QtQuick.Controls.Basic

Rectangle {
    id: root
    color: "#1a1f29"
    implicitHeight: 32

    signal settingsClicked()
    signal recoverClicked()

    property string clockText: ""
    property bool lagOn: false

    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: "#2d3748" }

    Timer {
        interval: 1000; running: true; repeat: true; triggeredOnStart: true
        onTriggered: {
            const now = new Date();
            root.clockText = now.toLocaleTimeString(Qt.locale(), "HH:mm:ss");
        }
    }

    // FPS counter
    property int fpsFrames: 0
    property real fpsLastSec: 0
    FrameAnimation {
        running: true
        onTriggered: {
            root.fpsFrames++;
            const now = elapsedTime;
            if (now - root.fpsLastSec >= 1.0) {
                appModel.reportFps(root.fpsFrames);
                root.fpsFrames = 0;
                root.fpsLastSec = now;
            }
        }
    }

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 12
        anchors.rightMargin: 12
        spacing: 16

        Text {
            text: "MKTTERM"
            color: "#3b82f6"
            font.family: "monospace"; font.pixelSize: 12; font.bold: true
        }
        Text {
            text: root.clockText
            color: "#6b7280"
            font.family: "monospace"; font.pixelSize: 10
        }
        Text {
            color: "#6b7280"
            font.family: "monospace"; font.pixelSize: 10
            textFormat: Text.RichText
            text: "<font color='#4ade80'>" + appModel.fps + "</font> fps"
        }
        Text {
            color: "#6b7280"
            font.family: "monospace"; font.pixelSize: 10
            textFormat: Text.RichText
            text: "lag <font color='#facc15'>" + appModel.lastMessageAge.toFixed(1) + "</font> ms"
        }

        Item { Layout.fillWidth: true }

        Text {
            text: appModel.currency
            color: "#9ca3af"; font.family: "monospace"; font.pixelSize: 10
        }
        TerminalButton {
            text: "SETTINGS"
            onClicked: root.settingsClicked()
        }
        TerminalButton {
            text: root.lagOn ? "LAG ON" : "LAG"
            accentColor: "#f97316"
            highlighted: root.lagOn
            onClicked: { root.lagOn = !root.lagOn; appModel.toggleLag(); }
        }
        TerminalButton {
            text: "RECOVER"
            accentColor: "#ef4444"
            onClicked: root.recoverClicked()
        }
    }

    component TerminalButton: Rectangle {
        id: btn
        property string text: ""
        property string accentColor: "#4b5563"
        property bool highlighted: false
        signal clicked()
        implicitHeight: 18
        implicitWidth: label.implicitWidth + 16
        color: btn.highlighted ? Qt.darker(btn.accentColor, 4.0) : "transparent"
        border.width: 1
        border.color: btn.highlighted || mouse.containsMouse ? btn.accentColor : "#2d3748"
        Text {
            id: label
            anchors.centerIn: parent
            text: btn.text
            color: btn.highlighted || mouse.containsMouse ? btn.accentColor : "#6b7280"
            font.family: "monospace"; font.pixelSize: 10
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
