import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
} from 'lightweight-charts';
import {styles} from '../styles/style';
import type { Candle, ChartMarker } from '../types/market';

interface ChartPanelProps {
  candles: Candle[];
  markers: ChartMarker[];
  onLoadOlder: () => void;
  followLatest?: boolean;
  /** When true, parent owns replay (paper mode) — hide chart's own bar replay UI. */
  hideInternalReplay?: boolean;
  replayLabel?: string;
}

// Calculate Simple Moving Average (SMA)
function calculateSMA(candles: Candle[], period: number) {
  const result: { time: Time; value: number }[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) continue;
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += candles[i - j].close;
    }
    result.push({
      time: candles[i].time as Time,
      value: Number((sum / period).toFixed(2)),
    });
  }
  return result;
}

function calculateEMA(candles: Candle[], period: number) {
  const result: { time: Time; value: number }[] = [];
  const k = 2 / (period + 1);
  let emaPrev: number | null = null;

  for (let i = 0; i < candles.length; i++) {
    const closePrice = candles[i].close;
    if (i < period - 1) continue;

    if (emaPrev === null) {
      // Calculate the initial SMA for the first EMA value
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += candles[i - j].close;
      }
      emaPrev = sum / period;
    } else {
      // Calculate EMA using the previous EMA value
      emaPrev = closePrice * k + emaPrev * (1 - k);
    }

    result.push({
      time: candles[i].time as Time,
      value: Number(emaPrev.toFixed(2)),
    });
  }
  return result;
}

export function ChartPanel({
  candles,
  markers,
  onLoadOlder,
  followLatest = false,
  hideInternalReplay = false,
  replayLabel,
}: ChartPanelProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null);
  const sma20Ref = useRef<ISeriesApi<'Line', Time> | null>(null);
  const sma50Ref = useRef<ISeriesApi<'Line', Time> | null>(null);
  const smaEma20Ref = useRef<ISeriesApi<'Line', Time> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  const onLoadOlderRef = useRef(onLoadOlder);
  const candlesRef = useRef(candles);
  const hasFitContentRef = useRef(false);
  const previousCandleCountRef = useRef(0);

  // Indicator Visibility States
  const [showSma20, setShowSma20] = useState(true);
  const [showSma50, setShowSma50] = useState(true);
  const [showEma200, setShowEma200] = useState(false);
  const [isIndicatorMenuOpen, setIsIndicatorMenuOpen] = useState(false);

  // Replay Engine States
  const [isReplayMode, setIsReplayMode] = useState(false);
  const [isSelectingCutPoint, setIsSelectingCutPoint] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(300);

  const isSelectingCutPointRef = useRef(isSelectingCutPoint);
  useEffect(() => {
    isSelectingCutPointRef.current = isSelectingCutPoint;
  }, [isSelectingCutPoint]);

  useEffect(() => {
    onLoadOlderRef.current = onLoadOlder;
    candlesRef.current = candles;
  }, [onLoadOlder, candles]);

  // Parent-owned replay (paper mode) — force chart's own replay off
  useEffect(() => {
    if (!hideInternalReplay) return;
    setIsReplayMode(false);
    setIsSelectingCutPoint(false);
    setIsPlaying(false);
  }, [hideInternalReplay]);

  // Handle Playback Interval
  useEffect(() => {
    if (!isPlaying || !isReplayMode || isSelectingCutPoint) return;

    const interval = setInterval(() => {
      setReplayIndex((prev) => {
        if (prev >= candles.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, replaySpeed);

    return () => clearInterval(interval);
  }, [isPlaying, isReplayMode, isSelectingCutPoint, replaySpeed, candles.length]);

  // Initialize Lightweight Chart Engine
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#B2B5BE',
        fontSize: 11,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, sans-serif",
      },
      grid: {
        vertLines: { color: '#1E222D' },
        horzLines: { color: '#1E222D' },
      },
      rightPriceScale: {
        borderColor: '#2A2E39',
        textColor: '#868993',
        autoScale: true,
        scaleMargins: {
          top: 0.18,
          bottom: 0.18,
        },
      },
      timeScale: {
        borderColor: '#2A2E39',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
      },
      crosshair: {
        vertLine: { color: '#758696', width: 1, style: 3 },
        horzLine: { color: '#758696', width: 1, style: 3 },
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#089981',
      downColor: '#f23645',
      borderVisible: false,
      wickUpColor: '#089981',
      wickDownColor: '#f23645',
    });

    const sma20Series = chart.addSeries(LineSeries, {
      color: '#2962FF',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const sma50Series = chart.addSeries(LineSeries, {
      color: '#FF6D00',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const smaEma20Series = chart.addSeries(LineSeries, {
      color: '#44ff00',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // Cut Candle Click Listener
    chart.subscribeClick((param) => {
      if (!isSelectingCutPointRef.current || !param.time) return;

      const clickedTime = param.time;
      const clickedIndex = candlesRef.current.findIndex(
        (c) => (c.time as Time) === clickedTime
      );

      if (clickedIndex !== -1) {
        setReplayIndex(clickedIndex);
        setIsSelectingCutPoint(false);
        setIsReplayMode(true);
        setIsPlaying(false);
      }
    });

    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range || isReplayMode) return;
      const barsInfo = series.barsInLogicalRange(range);
      if (barsInfo && barsInfo.barsBefore < 50) {
        onLoadOlderRef.current();
      }
    });

    const markerApi = createSeriesMarkers(series, []);

    chartRef.current = chart;
    seriesRef.current = series;
    sma20Ref.current = sma20Series;
    sma50Ref.current = sma50Series;
    smaEma20Ref.current = smaEma20Series;
    markersRef.current = markerApi;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      sma20Ref.current = null;
      sma50Ref.current = null;
      smaEma20Ref.current = null;
      hasFitContentRef.current = false;
      previousCandleCountRef.current = 0;
      markersRef.current = null;
    };
  }, []);

  // ResizeObserver: Dynamically resize chart canvas to fill parent container
  useEffect(() => {
    if (!containerRef.current || !chartRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        chartRef.current?.applyOptions({ width, height });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const activeCandles = isReplayMode
    ? candles.slice(0, replayIndex + 1)
    : candles;

  // Sync Chart Series Data & Indicators
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    const previousRange = chart.timeScale().getVisibleLogicalRange();
    const previousCandleCount = previousCandleCountRef.current;
    const addedCandles = activeCandles.length - previousCandleCount;

    series.setData(
      activeCandles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );
 
    if (sma20Ref.current) {
      sma20Ref.current.setData(showSma20 ? calculateSMA(activeCandles, 20) : []);
    }
    if (sma50Ref.current) {
      sma50Ref.current.setData(showSma50 ? calculateSMA(activeCandles, 50) : []);
    }
    if (smaEma20Ref.current) {
      smaEma20Ref.current.setData(showEma200 ? calculateEMA(activeCandles, 200) : []);
    }
    if (!hasFitContentRef.current && activeCandles.length > 0) {
      chart.timeScale().fitContent();
      hasFitContentRef.current = true;
    } else if (followLatest && activeCandles.length > 0) {
      chart.timeScale().scrollToPosition(8, true);
    } else if (previousRange && addedCandles > 0 && !isReplayMode) {
      chart.timeScale().setVisibleLogicalRange({
        from: previousRange.from + addedCandles,
        to: previousRange.to + addedCandles,
      });
    }

    previousCandleCountRef.current = activeCandles.length;
  }, [activeCandles, followLatest, showSma20, showSma50, showEma200, isReplayMode]);

  // Sync Markers
  useEffect(() => {
    if (!markersRef.current) return;
    const activeTimeSet = new Set(
      activeCandles.map((c) => c.time as string | number)
    );
    const replayMarker = replayLabel && activeCandles.length > 0
      ? {
          color: '#2962ff',
          position: 'belowBar' as const,
          shape: 'arrowUp' as const,
          text: replayLabel,
          time: activeCandles[activeCandles.length - 1].time,
        }
      : null;
    const allMarkers = replayMarker ? [...markers, replayMarker] : markers;
    const visibleMarkers = allMarkers.filter((m) =>
      activeTimeSet.has(m.time as string | number)
    );

    markersRef.current.setMarkers(
      visibleMarkers.map((m) => ({ ...m, time: m.time as Time }))
    );
  }, [markers, activeCandles, replayLabel]);

  const handleToggleReplay = () => {
    if (!isReplayMode && !isSelectingCutPoint) {
      setIsSelectingCutPoint(true);
      setIsPlaying(false);
    } else {
      setIsReplayMode(false);
      setIsSelectingCutPoint(false);
      setIsPlaying(false);
    }
  };

  return (
    <div ref={wrapperRef} style={styles.wrapper}>
      {/* Top Header Toolbar */}
      <div style={styles.topHeader}>
        <div style={styles.brandGroup}>
          <span style={styles.title}>Historical Candles</span>
          <span style={styles.badge}>
            {activeCandles.length} / {candles.length} Bars
          </span>
        </div>

        <div style={styles.headerRight}>
          {/* Indicators Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              style={styles.headerBtn}
              onClick={() => setIsIndicatorMenuOpen(!isIndicatorMenuOpen)}
            >
              <IndicatorsIcon />
              <span>Indicators</span>
            </button>

            {isIndicatorMenuOpen && (
              <div style={styles.dropdownMenu}>
                <div style={styles.dropdownTitle}>Technical Indicators</div>
                <div
                  style={styles.dropdownItem}
                  onClick={() => setShowSma20(!showSma20)}
                >
                  <span style={{ color: '#2962FF', fontWeight: 600 }}>● SMA 20</span>
                  <input type="checkbox" checked={showSma20} readOnly />
                </div>
                <div
                  style={styles.dropdownItem}
                  onClick={() => setShowEma200(!showEma200)}
                >
                  <span style={{ color: '#44ff00', fontWeight: 600 }}>● EMA 200</span>
                  <input type="checkbox" checked={showEma200} readOnly />
                </div>
                <div
                  style={styles.dropdownItem}
                  onClick={() => setShowSma50(!showSma50)}
                >
                  <span style={{ color: '#FF6D00', fontWeight: 600 }}>● SMA 50</span>
                  <input type="checkbox" checked={showSma50} readOnly />
                </div>
              </div>
            )}
          </div>

          <div style={styles.separator} />

          {/* Bar Replay — disabled when parent (paper mode) owns the replay cursor */}
          {!hideInternalReplay && (
            <button
              style={{
                ...styles.headerBtn,
                ...(isReplayMode || isSelectingCutPoint ? styles.activeReplayBtn : {}),
              }}
              onClick={handleToggleReplay}
            >
              <ReplayIcon />
              <span>
                {isSelectingCutPoint
                  ? 'Cancel Cut'
                  : isReplayMode
                  ? 'Exit Replay'
                  : 'Bar Replay'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Main Canvas Container */}
      <div style={styles.canvasContainer}>
        {/* Cut Mode Banner */}
        {isSelectingCutPoint && (
          <div style={styles.cutBanner}>
            <ScissorsIcon />
            <span>Click on any candle on the chart to cut history and start replay</span>
          </div>
        )}

        {/* On-Chart Legend */}
        <div style={styles.legendOverlay}>
          {showSma20 && (
            <div style={styles.legendRow}>
              <span style={{ color: '#2962FF', fontWeight: 600 }}>SMA 20</span>
              <button
                style={styles.iconBtn}
                onClick={() => setShowSma20(false)}
                title="Hide Indicator"
              >
                <EyeIcon />
              </button>
            </div>
          )}
          {showSma50 && (
            <div style={styles.legendRow}>
              <span style={{ color: '#FF6D00', fontWeight: 600 }}>SMA 50</span>
              <button
                style={styles.iconBtn}
                onClick={() => setShowSma50(false)}
                title="Hide Indicator"
              >
                <EyeIcon />
              </button>
            </div>
          )}
          {showEma200 && (
            <div style={styles.legendRow}>
              <span style={{ color: '#44ff00', fontWeight: 600 }}>EMA 200</span>
              <button
                style={styles.iconBtn}
                onClick={() => setShowEma200(false)}
                title="Hide Indicator"
              >
                <EyeIcon />
              </button>
            </div>
          )}
        </div>

        {/* Floating Replay Controls */}
        {isReplayMode && !isSelectingCutPoint && (
          <div style={styles.floatingReplayBar}>
            <button
              style={styles.controlBtn}
              onClick={() => {
                setIsPlaying(false);
                setIsSelectingCutPoint(true);
              }}
              title="Jump to new candle (Cut)"
            >
              <ScissorsIcon />
            </button>

            <div style={styles.innerSeparator} />

            <button
              style={{
                ...styles.controlBtn,
                opacity: replayIndex >= candles.length - 1 ? 0.4 : 1,
              }}
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={replayIndex >= candles.length - 1}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>

            <button
              style={{
                ...styles.controlBtn,
                opacity: replayIndex <= 0 || isPlaying ? 0.4 : 1,
              }}
              onClick={() => setReplayIndex((prev) => Math.max(0, prev - 1))}
              disabled={replayIndex <= 0 || isPlaying}
              title="Step Backward"
            >
              <StepBackIcon />
            </button>

            <button
              style={{
                ...styles.controlBtn,
                opacity: replayIndex >= candles.length - 1 || isPlaying ? 0.4 : 1,
              }}
              onClick={() =>
                setReplayIndex((prev) => Math.min(candles.length - 1, prev + 1))
              }
              disabled={replayIndex >= candles.length - 1 || isPlaying}
              title="Step Forward"
            >
              <StepForwardIcon />
            </button>

            <select
              style={styles.speedSelect}
              value={replaySpeed}
              onChange={(e) => setReplaySpeed(Number(e.target.value))}
            >
              <option value={1000}>0.5x</option>
              <option value={300}>1x</option>
              <option value={150}>2x</option>
              <option value={50}>5x</option>
            </select>

            <input
              type="range"
              min={0}
              max={candles.length - 1}
              value={replayIndex}
              onChange={(e) => {
                setIsPlaying(false);
                setReplayIndex(Number(e.target.value));
              }}
              style={styles.scrubber}
            />
          </div>
        )}

        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// INLINE SVGS (Updated to explicitly force #F0F3FA color rendering)
// -------------------------------------------------------------

const IndicatorsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D1D4DC" strokeWidth="2">
    <path d="M3 3v18h18" />
    <path d="M18 17V9" />
    <path d="M13 17V5" />
    <path d="M8 17v-3" />
  </svg>
);

const ReplayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);

const ScissorsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F0F3FA" strokeWidth="2">
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" />
    <line x1="14.47" y1="14.48" x2="20" y2="20" />
    <line x1="8.12" y1="8.12" x2="12" y2="12" />
  </svg>
);

const PlayIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#F0F3FA">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const PauseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#F0F3FA">
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
);

const StepBackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#F0F3FA">
    <polygon points="11 19 2 12 11 5 11 19" />
    <polygon points="22 19 13 12 22 5 22 19" />
  </svg>
);

const StepForwardIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#F0F3FA">
    <polygon points="13 19 22 12 13 5 13 19" />
    <polygon points="2 19 11 12 2 5 2 19" />
  </svg>
);

const EyeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#787B86" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

// -------------------------------------------------------------
// STYLES
// -------------------------------------------------------------
