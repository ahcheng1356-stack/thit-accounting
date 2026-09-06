type SalesOrder = { soldTons: number; unitPrice: number; paidAmount: number };

export function financialTotals(orders: SalesOrder[], capital: number, expense: number) {
  const sales = orders.reduce((sum, order) => sum + Number(order.soldTons || 0) * Number(order.unitPrice || 0), 0);
  const received = orders.reduce((sum, order) => sum + Number(order.paidAmount || 0), 0);
  const due = orders.reduce((sum, order) => sum + Math.max(0, Number(order.soldTons || 0) * Number(order.unitPrice || 0) - Number(order.paidAmount || 0)), 0);
  return { sales, received, due, profit: sales - expense, balance: capital + received - expense, projectedBalance: capital + received + due - expense };
}
