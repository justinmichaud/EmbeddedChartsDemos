#pragma once

#include <QObject>
#include <QPointer>
#include <QSettings>
#include <QStringList>
#include <QThread>
#include <QVector>
#include <array>
#include <qqml.h>

#include "Snapshot.h"
#include "StockItem.h"

class DataEngine;

class AppModel : public QObject
{
    Q_OBJECT
    QML_ELEMENT
    QML_UNCREATABLE("Provided by C++")

    Q_PROPERTY(int tick READ tick NOTIFY snapshotApplied)
    Q_PROPERTY(double sweepPos READ sweepPos NOTIFY snapshotApplied)
    Q_PROPERTY(QString currency READ currency NOTIFY currencyChanged)
    Q_PROPERTY(int numCharts READ numCharts NOTIFY numChartsChanged)
    Q_PROPERTY(QList<QObject*> stocks READ stocksAsObjects NOTIFY stocksChanged)
    Q_PROPERTY(QStringList headlines READ headlines NOTIFY headlinesChanged)
    Q_PROPERTY(int newsIndex READ newsIndex NOTIFY snapshotApplied)
    Q_PROPERTY(double lastMessageAge READ lastMessageAge NOTIFY snapshotApplied)
    Q_PROPERTY(int fps READ fps NOTIFY fpsChanged)
public:
    explicit AppModel(QObject *parent = nullptr);
    ~AppModel() override;

    int tick() const { return m_tick; }
    double sweepPos() const { return m_sweepPos; }
    QString currency() const { return m_currency; }
    int numCharts() const { return m_numCharts; }
    QStringList headlines() const { return m_headlines; }
    int newsIndex() const { return m_newsIndex; }
    double lastMessageAge() const { return m_lastMessageAge; }
    int fps() const { return m_fps; }
    QList<QObject*> stocksAsObjects() const;

    Q_INVOKABLE StockItem *stockBySymbol(const QString &symbol) const;

    // Control-plane: invoked from QML.
    Q_INVOKABLE void updateCurrency(const QString &currency);
    Q_INVOKABLE void updateNumCharts(int numCharts);
    Q_INVOKABLE void resetSettings();
    Q_INVOKABLE void clearStorage();
    Q_INVOKABLE void toggleLag();
    Q_INVOKABLE void reportFps(int fps);

    // Wiring; called from DataEngine::start.
    void bindEngine(DataEngine *engine, QThread *thread);

public slots:
    void onSnapshot(const Snapshot &snapshot);
    void onEngineSettingsChanged(const QString &currency, int numCharts);

signals:
    void snapshotApplied();
    void currencyChanged();
    void numChartsChanged();
    void stocksChanged();
    void headlinesChanged();
    void fpsChanged();

    // Forwarded to the engine thread via queued connection.
    void requestUpdateSettings(const QString &currency, int numCharts);
    void requestResetSettings();
    void requestSnapshot();
    void requestToggleLag();

private:
    void resizeStocks(int n);
    void persist();

    QPointer<DataEngine> m_engine;
    QPointer<QThread> m_engineThread;
    QSettings m_settings;

    int m_tick = 0;
    double m_sweepPos = 0.0;
    QString m_currency = "USD";
    int m_numCharts = 14;
    QStringList m_headlines;
    int m_newsIndex = 0;
    double m_lastMessageAge = 0.0;
    int m_fps = 0;

    static constexpr int kAgeSamples = 10;
    std::array<double, kAgeSamples> m_ageBuffer{};
    int m_ageIdx = 0;

    QVector<StockItem*> m_stocks;
};
