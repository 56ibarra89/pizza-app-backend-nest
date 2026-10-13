export interface PaymentBreakdownRowDto {
  id: string;
  name: string;
  type: string;
  currency: string;
  amount: number;
  originalAmount?: number;
  transactionCount: number;
}

export interface TopProductDto {
  name: string;
  quantity: number;
  totalRevenue: number;
  categoryId?: string;
  categoryName?: string;
}

export interface SalesByTimeDto {
  time: string;
  sales: number;
  ordersCount: number;
}

export interface ChannelSalesSummaryDto {
  type: 'delivery' | 'llevar' | 'local';
  label: string;
  sales: number;
  ordersCount: number;
  percentage: number;
}

export interface SalesReportDto {
  totalSales: number;
  cashSales: number;
  cardSales: number;
  appSales: number;
  paymentBreakdown: PaymentBreakdownRowDto[];
  totalOrders: number;
  totalDiscounts: number;
  discountedOrdersCount: number;
  topProducts: TopProductDto[];
  salesByTime: SalesByTimeDto[];
  channelsSummary: ChannelSalesSummaryDto[];
}
