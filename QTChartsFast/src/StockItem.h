#pragma once

#include <QObject>
#include <QPointF>
#include <QString>
#include <QList>
#include <qqml.h>

#include "Snapshot.h"

class StockItem : public QObject
{
    Q_OBJECT
    QML_ELEMENT
    QML_UNCREATABLE("Provided by AppModel")
    Q_PROPERTY(QString symbol READ symbol NOTIFY symbolChanged)
    Q_PROPERTY(double currentBid READ currentBid NOTIFY pricesChanged)
    Q_PROPERTY(double currentMid READ currentMid NOTIFY pricesChanged)
    Q_PROPERTY(double currentAsk READ currentAsk NOTIFY pricesChanged)
    Q_PROPERTY(double change READ change NOTIFY pricesChanged)
    Q_PROPERTY(double high READ high NOTIFY pricesChanged)
    Q_PROPERTY(double low READ low NOTIFY pricesChanged)
    Q_PROPERTY(double yMin READ yMin NOTIFY pricesChanged)
    Q_PROPERTY(double yMax READ yMax NOTIFY pricesChanged)
    Q_PROPERTY(double xMin READ xMin NOTIFY pricesChanged)
    Q_PROPERTY(double xMax READ xMax NOTIFY pricesChanged)
    Q_PROPERTY(QList<QPointF> midPoints READ midPoints NOTIFY pointsChanged)
    Q_PROPERTY(QList<QPointF> bidPoints READ bidPoints NOTIFY pointsChanged)
    Q_PROPERTY(QList<QPointF> askPoints READ askPoints NOTIFY pointsChanged)
public:
    explicit StockItem(QObject *parent = nullptr);

    void update(const StockTrace &trace);

    // Bulk-replace a Qt Charts XYSeries' points. Takes QObject* because
    // exposing QXYSeries* in the public header would couple this model to
    // the charts module. Internally invokes XYSeries::replace via the meta
    // system. Workaround for Qt 6.4 where the QList<QPointF> overload isn't
    // visible to QML.
    Q_INVOKABLE void replaceMid(QObject *series) const;
    Q_INVOKABLE void replaceBid(QObject *series) const;
    Q_INVOKABLE void replaceAsk(QObject *series) const;

    QString symbol() const { return m_symbol; }
    double currentBid() const { return m_currentBid; }
    double currentMid() const { return m_currentMid; }
    double currentAsk() const { return m_currentAsk; }
    double change() const { return m_change; }
    double high() const { return m_high; }
    double low() const { return m_low; }
    double yMin() const { return m_yMin; }
    double yMax() const { return m_yMax; }
    double xMin() const { return m_xMin; }
    double xMax() const { return m_xMax; }
    const QList<QPointF> &midPoints() const { return m_midPoints; }
    const QList<QPointF> &bidPoints() const { return m_bidPoints; }
    const QList<QPointF> &askPoints() const { return m_askPoints; }

signals:
    void symbolChanged();
    void pricesChanged();
    void pointsChanged();

private:
    QString m_symbol;
    double m_currentBid = 0.0;
    double m_currentMid = 0.0;
    double m_currentAsk = 0.0;
    double m_change = 0.0;
    double m_high = 0.0;
    double m_low = 0.0;
    double m_yMin = 0.0;
    double m_yMax = 0.0;
    double m_xMin = 0.0;
    double m_xMax = 0.0;
    QList<QPointF> m_midPoints;
    QList<QPointF> m_bidPoints;
    QList<QPointF> m_askPoints;
};
