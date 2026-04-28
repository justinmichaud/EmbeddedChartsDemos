#include <QApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>
#include <QUrl>

#include "AppModel.h"
#include "DataEngine.h"

int main(int argc, char *argv[])
{
    QApplication app(argc, argv);

    QApplication::setOrganizationName("EmbeddedDemos");
    QApplication::setApplicationName("QtChartsDemo");

    QQuickStyle::setStyle("Basic");

    AppModel appModel;
    DataEngine::start(&appModel);

    QQmlApplicationEngine engine;
    engine.addImportPath("qrc:/");
    engine.rootContext()->setContextProperty("appModel", &appModel);
    engine.load(QUrl(QStringLiteral("qrc:/QtChartsDemo/qml/Main.qml")));

    if (engine.rootObjects().isEmpty())
        return -1;

    return app.exec();
}
