#include "AppModel.h"
#include "DataEngine.h"

#include <QDateTime>
#include <QMetaObject>
#include <algorithm>

AppModel::AppModel(QObject *parent)
    : QObject(parent)
{
    qRegisterMetaType<Snapshot>("Snapshot");

    m_currency = m_settings.value("currency", "USD").toString();
    m_numCharts = std::min(m_settings.value("numCharts", 14).toInt(), MAX_STOCKS);
}

AppModel::~AppModel()
{
    if (m_engineThread) {
        m_engineThread->quit();
        m_engineThread->wait();
    }
}

void AppModel::bindEngine(DataEngine *engine, QThread *thread)
{
    m_engine = engine;
    m_engineThread = thread;

    // Forward control-plane signals to the engine across the thread boundary.
    connect(this, &AppModel::requestUpdateSettings,
            engine, &DataEngine::updateSettings, Qt::QueuedConnection);
    connect(this, &AppModel::requestResetSettings,
            engine, &DataEngine::resetSettings, Qt::QueuedConnection);
    connect(this, &AppModel::requestSnapshot,
            engine, &DataEngine::requestSnapshot, Qt::QueuedConnection);
    connect(this, &AppModel::requestToggleLag,
            engine, &DataEngine::toggleLag, Qt::QueuedConnection);

    // Push the persisted settings to the engine on startup.
    emit requestUpdateSettings(m_currency, m_numCharts);
}

QList<QObject*> AppModel::stocksAsObjects() const
{
    QList<QObject*> out;
    out.reserve(m_stocks.size());
    for (auto *s : m_stocks)
        out.append(s);
    return out;
}

StockItem *AppModel::stockBySymbol(const QString &symbol) const
{
    for (auto *s : m_stocks) {
        if (s->symbol() == symbol)
            return s;
    }
    return nullptr;
}

void AppModel::resizeStocks(int n)
{
    if (n == m_stocks.size())
        return;
    while (m_stocks.size() < n)
        m_stocks.append(new StockItem(this));
    while (m_stocks.size() > n) {
        auto *s = m_stocks.takeLast();
        s->deleteLater();
    }
    emit stocksChanged();
}

void AppModel::onSnapshot(const Snapshot &snapshot)
{
    const qint64 now = QDateTime::currentMSecsSinceEpoch();
    const double age = double(now - snapshot.timestampMs);
    m_ageBuffer[m_ageIdx % kAgeSamples] = age;
    ++m_ageIdx;
    double sum = 0.0;
    for (double v : m_ageBuffer) sum += v;
    m_lastMessageAge = sum / double(kAgeSamples);

    m_tick = snapshot.tick;
    m_sweepPos = snapshot.sweepPos;

    if (m_headlines != snapshot.headlines) {
        m_headlines = snapshot.headlines;
        emit headlinesChanged();
    }
    m_newsIndex = snapshot.newsIndex;

    resizeStocks(snapshot.stocks.size());
    for (int i = 0; i < snapshot.stocks.size(); ++i)
        m_stocks[i]->update(snapshot.stocks[i]);

    emit snapshotApplied();
}

void AppModel::onEngineSettingsChanged(const QString &currency, int numCharts)
{
    bool currencyChanged_ = false;
    bool numChartsChanged_ = false;
    if (currency != m_currency) {
        m_currency = currency;
        currencyChanged_ = true;
    }
    if (numCharts != m_numCharts) {
        m_numCharts = numCharts;
        numChartsChanged_ = true;
    }
    persist();
    if (currencyChanged_) emit currencyChanged();
    if (numChartsChanged_) emit numChartsChanged();
}

void AppModel::updateCurrency(const QString &currency)
{
    if (currency == m_currency) return;
    emit requestUpdateSettings(currency, 0);
}

void AppModel::updateNumCharts(int numCharts)
{
    if (numCharts == m_numCharts) return;
    emit requestUpdateSettings(QString(), numCharts);
}

void AppModel::resetSettings()
{
    emit requestResetSettings();
}

void AppModel::clearStorage()
{
    m_settings.clear();
    m_settings.sync();
    emit requestResetSettings();
}

void AppModel::toggleLag()
{
    emit requestToggleLag();
}

void AppModel::reportFps(int fps)
{
    if (fps == m_fps) return;
    m_fps = fps;
    emit fpsChanged();
}

void AppModel::persist()
{
    m_settings.setValue("currency", m_currency);
    m_settings.setValue("numCharts", m_numCharts);
}
