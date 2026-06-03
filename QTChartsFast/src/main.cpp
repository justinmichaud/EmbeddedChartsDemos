#include <QApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>
#include <QQuickWindow>
#include <QSettings>
#include <QtGlobal>
#include <QUrl>

#include "AppModel.h"
#include "DataEngine.h"

int main(int argc, char *argv[])
{
    // This variant uses QtCharts LineSeries with useOpenGL: true. Those
    // accelerated series render through an OpenGL context, but Qt 6 on macOS
    // defaults the Qt Quick scenegraph to the Metal RHI backend — under which
    // the GL series draw nothing. Pin the scenegraph to OpenGL so the chart
    // lines actually render. Must be set before the first QQuickWindow.
    QQuickWindow::setGraphicsApi(QSGRendererInterface::OpenGL);

    QApplication app(argc, argv);

    QApplication::setOrganizationName("EmbeddedDemos");
    QApplication::setApplicationName("QtChartsDemo");

    // When BENCH_RESET=1 (set by bench/bench-QTChartsFast.mjs), wipe persisted
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
