import QtQuick

Item {
    id: root
    property real sweepPos: 0
    z: 10

    // Subtle wash + a bright leading edge that sweeps left → right.
    Rectangle {
        anchors.fill: parent
        color: "#3b82f6"
        opacity: 0.05
    }
    Rectangle {
        // Leading edge
        x: parent.width * root.sweepPos - 1
        y: 0
        width: 2
        height: parent.height
        color: "#63b3ed"
        opacity: 0.55
    }
    // Pass-through clicks.
    MouseArea {
        anchors.fill: parent
        enabled: false
    }
}
