function getFormatter(
  options: Intl.DateTimeFormatOptions,
  timeZone?: string | null,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    ...(timeZone ? { timeZone } : {}),
  });
}

export function formatDateForTimeZone(
  date: Date,
  timeZone?: string | null,
): string {
  return getFormatter(
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    },
    timeZone,
  ).format(date);
}

export function formatDateTimeForTimeZone(
  date: Date,
  timeZone?: string | null,
): string {
  return getFormatter(
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    },
    timeZone,
  ).format(date);
}

export function formatDateRangeForTimeZone(
  startDate: Date,
  endDate: Date,
  timeZone?: string | null,
): string {
  return `${formatDateTimeForTimeZone(startDate, timeZone)} - ${formatDateTimeForTimeZone(endDate, timeZone)}`;
}
