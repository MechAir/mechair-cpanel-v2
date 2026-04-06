export const generateNextPoint = (lastValue: number, min: number, max: number, volatility: number = 5): number => {
  const change = (Math.random() - 0.5) * volatility;
  let newValue = lastValue + change;
  if (newValue < min) newValue = min + Math.abs(change);
  if (newValue > max) newValue = max - Math.abs(change);
  return Number(newValue.toFixed(1));
};

export const dataToPath = (
  data: number[],
  width: number,
  height: number,
  minVal: number,
  maxVal: number
): string => {
  if (data.length === 0) return '';

  const stepX = width / (data.length - 1);
  const range = maxVal - minVal;

  const points = data.map((val, index) => {
    const x = index * stepX;
    // Invert Y because SVG coordinates start from top-left
    const normalizedY = (val - minVal) / range;
    const y = height - (normalizedY * height);
    return `${x},${y}`;
  });

  return `M ${points.join(' L ')}`;
};

export const generateInitialData = (count: number, min: number, max: number): number[] => {
  const data = [];
  let current = (min + max) / 2;
  for (let i = 0; i < count; i++) {
    data.push(current);
    current = generateNextPoint(current, min, max);
  }
  return data;
};
