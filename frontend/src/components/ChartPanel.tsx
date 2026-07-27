import { useEffect, useRef } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
} from 'lightweight-charts';

import type { Candle, ChartMarker } from '../types/market';

interface ChartPanelProps {
  candles: Candle[];
  markers: ChartMarker[];
}

export function ChartPanel({ candles, markers }: ChartPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const container = containerRef.current;
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#28343f',
      },
      grid: {
        vertLines: { color: '#edf2f7' },
        horzLines: { color: '#edf2f7' },
      },
      rightPriceScale: {
        borderColor: '#d9e2ec',
      },
      timeScale: {
        borderColor: '#d9e2ec',
        timeVisible: true,
      },
      crosshair: {
        vertLine: { color: '#52616b' },
        horzLine: { color: '#52616b' },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#0f9f6e',
      downColor: '#d64545',
      borderVisible: false,
      wickUpColor: '#0f9f6e',
      wickDownColor: '#d64545',
    });

    const markerApi = createSeriesMarkers(series, []);

    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = markerApi;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;

    if (!series || !chart) {
      return;
    }

    series.setData(
      candles.map((candle) => ({
        time: candle.time as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      }))
    );

    chart.timeScale().fitContent();
  }, [candles]);

  useEffect(() => {
    markersRef.current?.setMarkers(
      markers.map((marker) => ({
        ...marker,
        time: marker.time as Time,
      }))
    );
  }, [markers]);

  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <h2>Historical Candles</h2>
        <span>{candles.length} candles</span>
      </div>
      <div ref={containerRef} className="chart-canvas" />
    </section>
  );
}
