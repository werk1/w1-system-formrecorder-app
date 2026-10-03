import React from "react";
import styles from './ProgressIndicator.module.css';

// ================================
// CIRCULAR PROGRESS INDICATOR
// ================================

export const CircularProgressIndicator = React.memo(({
  progress,
  showProgress = true,
  size = 50,
  strokeWidth = 3,
  color = "rgba(255, 255, 255, 0.9)",
  backgroundColor = "rgba(255, 255, 255, 0.2)"
}: {
  progress?: number;
  showProgress?: boolean;
  size?: number;
  strokeWidth?: number;
  color?: string;
  backgroundColor?: string;
}) => {
  if (!showProgress) return null;

  const isIndeterminate = progress === undefined;
  const progressValue = progress ?? 0;

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (progressValue * circumference);

  return (
    <div className={styles.circularContainer} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className={styles.circularSvg}
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          className={`${styles.circularProgress} ${isIndeterminate ? styles.indeterminate : ''}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>

    </div>
  );
});

CircularProgressIndicator.displayName = 'CircularProgressIndicator';

// ================================
// BAR PROGRESS INDICATOR
// ================================

export const BarProgressIndicator = React.memo(({
  progress,
  showProgress = true,
  width = 200,
  height = 4,
  backgroundColor = "rgba(255, 255, 255, 0.2)",
  progressColor = "rgba(255, 255, 255, 0.9)",
  borderRadius = 2
}: {
  progress?: number;
  showProgress?: boolean;
  width?: number;
  height?: number;
  backgroundColor?: string;
  progressColor?: string;
  borderRadius?: number;
}) => {
  if (!showProgress) return null;

  const isIndeterminate = progress === undefined;
  const progressValue = progress ?? 0;

  return (
    <div className={styles.barWrapper}>
      <div
        className={styles.barContainer}
        style={{
          width,
          height,
          backgroundColor,
          borderRadius: borderRadius
        }}
      >
        <div
          className={`${styles.barProgress} ${isIndeterminate ? styles.indeterminateBar : ''}`}
          style={{
            width: isIndeterminate ? '30%' : `${progressValue * 100}%`,
            height: '100%',
            backgroundColor: progressColor,
            borderRadius: borderRadius
          }}
        />
      </div>

    </div>
  );
});

BarProgressIndicator.displayName = 'BarProgressIndicator';

// ================================
// SPINNER PROGRESS INDICATOR
// ================================

export const SpinnerProgressIndicator = React.memo(({
  progress,
  showProgress = true,
  size = 40
}: {
  progress?: number;
  showProgress?: boolean;
  size?: number;
}) => {
  if (!showProgress) return null;

  const isIndeterminate = progress === undefined;
  const progressValue = progress ?? 0;

  return (
    <div
      className={`${styles.spinnerContainer} ${isIndeterminate ? styles.indeterminateSpinner : ''}`}
      style={{ width: size, height: size }}
    >
      <div
        className={styles.spinnerBar}
        style={{
          width: isIndeterminate ? '100%' : `${progressValue * 100}%`,
          height: '100%'
        }}
      />
    </div>
  );
});

SpinnerProgressIndicator.displayName = 'SpinnerProgressIndicator';
