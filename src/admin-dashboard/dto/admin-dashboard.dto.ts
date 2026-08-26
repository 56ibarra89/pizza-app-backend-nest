export interface ActiveCashRegisterDto {
  id: string;
  name: string;
  cashierId: string;
  cashier: string;
  cashierRole: string;
  startTime: Date;
  openingAmount: number;
  revenueCash: number;
  revenueCard: number;
  revenueApp: number;
  revenueTotal: number;
  transactionsCompleted: number;
}

export interface WaiterPerformanceDto {
  id: string;
  name: string;
  ordersServed: number;
  revenueTotal: number;
  avatarColor: string;
}

export interface LiveKpisDto {
  totalSalesToday: number;
  activeOccupiedTables: number;
  pendingKitchenOrders: number;
  activeDeliveryOrders: number;
}
