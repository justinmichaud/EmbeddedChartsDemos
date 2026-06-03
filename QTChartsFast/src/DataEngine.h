#pragma once

#include <QObject>
#include <QThread>
#include <QTimer>
#include <array>

#include "Snapshot.h"

class AppModel;

class DataEngine : public QObject
{
    Q_OBJECT
public:
    explicit DataEngine(QObject *parent = nullptr);

    // Spin up a worker thread, create a DataEngine inside it,
    // and connect dataReady -> appModel::onSnapshot.
    static void start(AppModel *appModel);

public slots:
    void init();
    void updateSettings(const QString &currency, int numCharts);
    void resetSettings();
    void requestSnapshot();
    void toggleLag();

signals:
    void dataReady(const Snapshot &snapshot);
    void settingsChanged(const QString &currency, int numCharts);

private slots:
    void tick();

private:
    Snapshot buildSnapshot(int n, qint64 timestampMs) const;
    double rand01();

    // Xorshift128 — deterministic, zero-allocation
    quint32 m_x = 0xDEADBEEFu;
    quint32 m_y = 362436069u;
    quint32 m_z = 521288629u;
    quint32 m_w = 88675123u;

    std::array<double, MAX_STOCKS * HISTORY_LEN> m_mid{};
    std::array<double, MAX_STOCKS * HISTORY_LEN> m_bid{};
    std::array<double, MAX_STOCKS * HISTORY_LEN> m_ask{};
    std::array<int, MAX_STOCKS * HISTORY_LEN> m_time{};
    std::array<int, MAX_STOCKS> m_head{};
    std::array<double, MAX_STOCKS> m_currentMid{};
    std::array<double, MAX_STOCKS> m_spreadBps{};

    QString m_currency = "USD";
    int m_numCharts = 50;

    int m_tick = 0;
    double m_sweepPos = 0.0;
    bool m_artificialLag = false;

    QTimer *m_timer = nullptr;
};
