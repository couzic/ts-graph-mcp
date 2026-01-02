import { formatValue } from "@libs/toolkit";

const LoadingWrapper = (value: number): string => {
  return `<div class="loading">${formatValue(value)}</div>`;
};

export default LoadingWrapper;
