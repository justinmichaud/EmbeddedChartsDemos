#include <QApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>
#include <QSettings>
#include <QtGlobal>
#include <QUrl>

#include "AppModel.h"
#include "DataEngine.h"

int main(int argc, char *argv[])
{
    QApplication app(argc, argv);

    QApplication::setOrganizationName("EmbeddedDemos");
    QApplication::setApplicationName("QtChartsDemo");

    // When BENCH_RESET=1 (set by bench/bench-QTCharts.mjs), wipe persisted
    // QSettings before anything reads them, so the run uses the app defaults.
    if (qEnvironmentVariableIntValue("BENCH_RESET") == 1)
        QSettings().clear();

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
