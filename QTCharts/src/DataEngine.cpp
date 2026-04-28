#include "DataEngine.h"
#include "AppModel.h"

#include <QDateTime>
#include <QtMath>
#include <algorithm>

namespace {

const QStringList kStockSymbols = {
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META",
    "BRK.B", "JPM", "V", "JNJ", "WMT", "PG", "XOM",
    "UNH", "MA", "HD", "BAC", "KO", "PEP", "ABBV", "MRK",
    "ORCL", "COST", "NFLX", "ADBE", "CSCO", "TMO", "ACN", "AVGO",
    "CRM", "MCD", "PFE", "LLY", "INTC", "AMD", "T", "WFC",
    "DIS", "NKE", "IBM", "BA", "GM", "F", "VZ", "QCOM",
    "TXN", "AMGN", "GS", "CAT"
};

const std::array<double, 50> kInitialPrices = {
    178.42, 412.88, 142.65, 186.33, 878.54, 248.91, 492.28,
    445.67, 198.72, 287.45, 156.23, 167.88, 162.45, 112.34,
    524.10,  482.55, 388.40,  39.85,  62.71, 173.92, 162.40, 128.55,
    142.30, 832.15, 632.80, 552.40,  49.32, 587.95, 367.20, 1745.10,
    298.40, 287.65,  28.12, 758.30,  35.45, 168.20,  19.85,  56.40,
    111.30,  82.55, 175.20, 213.40,  52.30,  12.85,  41.20, 174.60,
    198.40, 312.55, 478.20, 358.40
};

const QStringList kHeadlines = {
    "Fed signals rate pause as inflation data cools",
    "Tech rally continues on strong earnings beat",
    "Oil prices surge amid Middle East tensions",
    "Dollar weakens as jobless claims rise unexpectedly",
    "S&P 500 hits new all-time high on GDP growth data",
    "Chip sector surges after semiconductor demand forecast raised",
    "Treasury yields rise on stronger-than-expected payrolls",
    "European markets close higher led by banking stocks",
    "Consumer confidence index exceeds analyst expectations",
    "Retail sales data sparks debate over soft landing",
    "Asian markets mixed after China manufacturing PMI miss",
    "Corporate buyback activity hits record quarterly high",
    "Hedge funds increase short positions in energy sector",
    "IPO market rebounds with three major listings this week",
    "Commodity prices under pressure as dollar strengthens",
    "Small-cap stocks outperform on domestic growth optimism",
    "Bond market volatility spikes on inflation expectations",
    "Biotech sector rallies on FDA fast-track designation news",
    "Emerging markets face headwinds from rising US yields",
    "Quarterly earnings season kicks off with mixed signals",
};

constexpr double kSweepStep = double(REFRESH_RATE_MS) / double(SWEEP_PERIOD_MS);

} // namespace

DataEngine::DataEngine(QObject *parent)
    : QObject(parent)
{
}

void DataEngine::start(AppModel *appModel)
{
    auto *thread = new QThread(appModel);
    thread->setObjectName("DataEngineThread");
    auto *engine = new DataEngine();
    engine->moveToThread(thread);

    QObject::connect(thread, &QThread::started, engine, &DataEngine::init);
    QObject::connect(thread, &QThread::finished, engine, &QObject::deleteLater);
    QObject::connect(engine, &DataEngine::dataReady,
                     appModel, &AppModel::onSnapshot, Qt::QueuedConnection);
    QObject::connect(engine, &DataEngine::settingsChanged,
                     appModel, &AppModel::onEngineSettingsChanged, Qt::QueuedConnection);

    appModel->bindEngine(engine, thread);
    thread->start();
}

double DataEngine::rand01()
{
    quint32 t = m_x ^ (m_x << 11);
    m_x = m_y; m_y = m_z; m_z = m_w;
    m_w = m_w ^ (m_w >> 19) ^ (t ^ (t >> 8));
    return double(m_w) / 4294967296.0;
}

void DataEngine::init()
{
    for (int s = 0; s < MAX_STOCKS; ++s) {
        const int symIdx = s % kStockSymbols.size();
        const double base = kInitialPrices[symIdx];
        m_currentMid[s] = base;
        m_spreadBps[s] = (2.0 + rand01() * 8.0) / 10000.0;
        for (int i = 0; i < HISTORY_LEN; ++i) {
            const double mid = base * (1.0 + (rand01() - 0.5) * 0.015);
            const double spread = mid * m_spreadBps[s];
            const int idx = s * HISTORY_LEN + i;
            m_mid[idx] = mid;
            m_bid[idx] = mid - spread / 2.0;
            m_ask[idx] = mid + spread / 2.0;
            m_time[idx] = i;
        }
        m_head[s] = 0;
        m_currentMid[s] = m_mid[s * HISTORY_LEN + HISTORY_LEN - 1];
    }

    m_timer = new QTimer(this);
    m_timer->setTimerType(Qt::PreciseTimer);
    m_timer->setInterval(REFRESH_RATE_MS);
    QObject::connect(m_timer, &QTimer::timeout, this, &DataEngine::tick);
    m_timer->start();

    // Initial snapshot so the UI has something to show before the first tick.
    requestSnapshot();
}

Snapshot DataEngine::buildSnapshot(int n, qint64 timestampMs) const
{
    Snapshot snap;
    snap.timestampMs = timestampMs;
    snap.tick = m_tick;
    snap.sweepPos = m_sweepPos;
    snap.currency = m_currency;
    snap.numCharts = m_numCharts;
    snap.headlines = kHeadlines;
    snap.newsIndex = int((qint64(m_tick) * REFRESH_RATE_MS / NEWS_RATE_MS) % kHeadlines.size());

    snap.stocks.reserve(n);
    for (int s = 0; s < n; ++s) {
        StockTrace tr;
        tr.symbol = kStockSymbols[s % kStockSymbols.size()];
        const int base = s * HISTORY_LEN;
        for (int i = 0; i < HISTORY_LEN; ++i) {
            tr.mid[i] = m_mid[base + i];
            tr.bid[i] = m_bid[base + i];
            tr.ask[i] = m_ask[base + i];
            tr.time[i] = m_time[base + i];
        }
        tr.head = m_head[s];
        snap.stocks.push_back(std::move(tr));
    }
    return snap;
}

void DataEngine::tick()
{
    ++m_tick;
    m_sweepPos = std::fmod(m_sweepPos + kSweepStep, 1.0);

    const qint64 now = QDateTime::currentMSecsSinceEpoch();
    const int n = std::min(m_numCharts, MAX_STOCKS);

    for (int s = 0; s < n; ++s) {
        const double newMid = m_currentMid[s] * (1.0 + (rand01() - 0.5) * 0.004);
        const double spread = newMid * m_spreadBps[s];
        m_currentMid[s] = newMid;

        const int head = m_head[s];
        const int idx = s * HISTORY_LEN + head;
        m_time[idx] = m_tick;
        m_mid[idx] = newMid;
        m_bid[idx] = newMid - spread / 2.0;
        m_ask[idx] = newMid + spread / 2.0;
        m_head[s] = (head + 1) % HISTORY_LEN;
    }

    emit dataReady(buildSnapshot(n, now));

    if (m_artificialLag) {
        // Match the JS demo's worker-side stall: burn CPU on this thread
        // so the engine misses ticks but the GUI stays responsive.
        volatile double sum = 0;
        for (int i = 0; i < 100'000'000; ++i)
            sum += std::sqrt(double(i));
        Q_UNUSED(sum);
    }
}

void DataEngine::updateSettings(const QString &currency, int numCharts)
{
    bool changed = false;
    if (!currency.isEmpty() && currency != m_currency) {
        m_currency = currency;
        changed = true;
    }
    if (numCharts > 0) {
        const int clamped = std::min(numCharts, MAX_STOCKS);
        if (clamped != m_numCharts) {
            m_numCharts = clamped;
            changed = true;
        }
    }
    if (changed)
        emit settingsChanged(m_currency, m_numCharts);
}

void DataEngine::resetSettings()
{
    m_currency = "USD";
    m_numCharts = 14;
    emit settingsChanged(m_currency, m_numCharts);
}

void DataEngine::requestSnapshot()
{
    const int n = std::min(m_numCharts, MAX_STOCKS);
    emit dataReady(buildSnapshot(n, QDateTime::currentMSecsSinceEpoch()));
}

void DataEngine::toggleLag()
{
    m_artificialLag = !m_artificialLag;
}
