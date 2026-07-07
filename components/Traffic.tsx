// Светофор «слоя понимания» (SPEC 4.11): зелёный/жёлтый/красный/нет данных.

export type TrafficColor = "green" | "yellow" | "red" | "gray";

export function TrafficDot({ color }: { color: TrafficColor }) {
  return <span className={`dot ${color}`} aria-hidden />;
}

/** Светофор по знаку величины: > 0 зелёный, 0 жёлтый, < 0 красный. */
export function trafficBySign(value: bigint): TrafficColor {
  if (value > 0n) return "green";
  if (value < 0n) return "red";
  return "yellow";
}

/** Светофор по рентабельности: null — нет данных; пороги по умолчанию 0 и 10 %. */
export function trafficByRatio(
  ratio: number | null,
  yellowBelow = 0.1
): TrafficColor {
  if (ratio === null) return "gray";
  if (ratio < 0) return "red";
  if (ratio < yellowBelow) return "yellow";
  return "green";
}
