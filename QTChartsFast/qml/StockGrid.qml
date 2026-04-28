import QtQuick
import QtQuick.Layouts

GridLayout {
    id: root
    signal stockClicked(string symbol)

    columns: 7
    columnSpacing: 8
    rowSpacing: 8

    Repeater {
        model: appModel.stocks
        delegate: StockChart {
            required property var modelData
            Layout.fillWidth: true
            Layout.preferredHeight: 200
            Layout.minimumWidth: 120
            stock: modelData
            currency: appModel.currency
            onClicked: root.stockClicked(modelData.symbol)
        }
    }
}
