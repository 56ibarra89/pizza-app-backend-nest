import { getBusinessDateParts } from '../../common/time/business-time.util';

const MONTHS = [
  'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN',
  'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC',
];

export function getInvoiceMonthlyPrefix(date: Date): string {
  const { year, month } = getBusinessDateParts(date);
  return `${MONTHS[month - 1]}${String(year).slice(-2)}-`;
}

export function formatInvoiceNumber(
  date: Date,
  prefix: string | null,
  issuedNumber: number,
  endNumber: number,
): string {
  const configuredPrefix = (prefix ?? '').replace(/^[a-z]{3}\d{2}-/i, '');
  const paddedNumber = String(issuedNumber).padStart(String(endNumber).length, '0');
  return `${getInvoiceMonthlyPrefix(date)}${configuredPrefix}${paddedNumber}`;
}
