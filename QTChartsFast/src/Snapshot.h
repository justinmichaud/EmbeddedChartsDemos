#pragma once

#include <QString>
#include <QVector>
#include <array>

constexpr int HISTORY_LEN = 60;
constexpr int MAX_STOCKS = 50;
constexpr int REFRESH_RATE_MS = 200;
constexpr int NEWS_RATE_MS = 10000;
constexpr int SWEEP_PERIOD_MS = 10000;

struct StockTrace {
    QString symbol;
    std::array<double, HISTORY_LEN> mid{};
    std::array<double, HISTORY_LEN> bid{};
    std::array<double, HISTORY_LEN> ask{};
    std::array<int, HISTORY_LEN> time{};
    int head = 0;
};

struct Snapshot {
    qint64 timestampMs = 0;
    int tick = 0;
    double sweepPos = 0.0;
    QString currency = "USD";
    int numCharts = 14;
    QVector<StockTrace> stocks;
    QStringList headlines;
    int newsIndex = 0;
};

Q_DECLARE_METATYPE(Snapshot)
