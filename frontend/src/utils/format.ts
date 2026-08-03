export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 2,
    style: 'currency',
  }).format(value);
}

export function formatSignedCurrency(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatCurrency(value)}`;
}

export function getErrorMessage(error: unknown): string {
  const axiosError = error as {
    response?: { data?: { error?: string } };
  };

  if (typeof axiosError.response?.data?.error === 'string') {
    return axiosError.response.data.error;
  }

  return error instanceof Error ? error.message : 'Backtest failed';
}
