#include "StockItem.h"

#include <QtCharts/QXYSeries>
#include <algorithm>
#include <limits>

QT_USE_NAMESPACE

StockItem::StockItem(QObject *parent)
    : QObject(parent)
{
    m_midPoints.reserve(HISTORY_LEN);
    m_bidPoints.reserve(HISTORY_LEN);
    m_askPoints.reserve(HISTORY_LEN);
    for (int i = 0; i < HISTORY_LEN; ++i) {
        m_midPoints.append(QPointF{double(i), 0.0});
        m_bidPoints.append(QPointF{double(i), 0.0});
        m_askPoints.append(QPointF{double(i), 0.0});
    }
}

void StockItem::update(const StockTrace &trace)
{
    bool symbolChanged_ = false;
    if (m_symbol != trace.symbol) {
        m_symbol = trace.symbol;
        symbolChanged_ = true;
    }

    const int last = (trace.head + HISTORY_LEN - 1) % HISTORY_LEN;
    const int first = trace.head % HISTORY_LEN;

    m_currentBid = trace.bid[last];
    m_currentMid = trace.mid[last];
    m_currentAsk = trace.ask[last];
    const double firstMid = trace.mid[first];
    m_change = firstMid != 0.0 ? ((m_currentMid - firstMid) / firstMid) * 100.0 : 0.0;

    double high = -std::numeric_limits<double>::infinity();
    double low = std::numeric_limits<double>::infinity();
    for (int i = 0; i < HISTORY_LEN; ++i) {
        if (trace.ask[i] > high) high = trace.ask[i];
        if (trace.bid[i] < low) low = trace.bid[i];
    }
    m_high = high;
    m_low = low;
    m_yMin = low * 0.9998;
    m_yMax = high * 1.0002;

    // Unroll the ring buffer in chronological order. X is the sample
    // position (0..HISTORY_LEN-1), not the tick number, so the X axis is
    // a fixed range and never has to be re-bound — important for keeping
    // ChartView from re-laying-out on every snapshot.
    for (int i = 0; i < HISTORY_LEN; ++i) {
        const int idx = (trace.head + i) % HISTORY_LEN;
        const double x = double(i);
        m_midPoints[i] = QPointF{x, trace.mid[idx]};
        m_bidPoints[i] = QPointF{x, trace.bid[idx]};
        m_askPoints[i] = QPointF{x, trace.ask[idx]};
    }
    m_xMin = 0.0;
    m_xMax = double(HISTORY_LEN - 1);

    if (symbolChanged_)
        emit symbolChanged();
    emit pricesChanged();
    emit pointsChanged();
}

void StockItem::replaceMid(QObject *series) const
{
    if (auto *s = qobject_cast<QXYSeries*>(series))
        s->replace(m_midPoints);
}

void StockItem::replaceBid(QObject *series) const
{
    if (auto *s = qobject_cast<QXYSeries*>(series))
        s->replace(m_bidPoints);
}

void StockItem::replaceAsk(QObject *series) const
{
    if (auto *s = qobject_cast<QXYSeries*>(series))
        s->replace(m_askPoints);
}
