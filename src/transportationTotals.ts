type RouteLeg = { orderId: number | null; fromLocation: string; toLocation: string; tons: number };

const key = (value: string) => value.trim().toLocaleLowerCase();

export function transportedTons(rows: RouteLeg[]) {
  const byOrder = new Map<number, RouteLeg[]>();
  for (const row of rows) {
    const orderId = Number(row.orderId || 0);
    if (orderId > 0) byOrder.set(orderId, [...(byOrder.get(orderId) || []), row]);
  }
  let grandTotal = 0;
  for (const orderRows of byOrder.values()) {
    const edges = orderRows.map(row => ({ from:key(row.fromLocation), to:key(row.toLocation), tons:Number(row.tons) })).filter(row => row.from && row.to && row.tons > 0);
    const unseen = new Set(edges.map((_, index) => index));
    while (unseen.size) {
      const first = unseen.values().next().value as number;
      unseen.delete(first);
      const component = [edges[first]], locations = new Set([edges[first].from, edges[first].to]);
      let expanded = true;
      while (expanded) {
        expanded = false;
        for (const index of [...unseen]) {
          const edge = edges[index];
          if (locations.has(edge.from) || locations.has(edge.to)) {
            unseen.delete(index); component.push(edge); locations.add(edge.from); locations.add(edge.to); expanded = true;
          }
        }
      }
      const destinations = new Set(component.map(edge => edge.to));
      const sourceTons = component.filter(edge => !destinations.has(edge.from)).reduce((sum, edge) => sum + edge.tons, 0);
      if (sourceTons > 0) grandTotal += sourceTons;
      else {
        const outgoing = new Map<string, number>();
        for (const edge of component) outgoing.set(edge.from, (outgoing.get(edge.from) || 0) + edge.tons);
        grandTotal += Math.max(0, ...outgoing.values());
      }
    }
  }
  return Number(grandTotal.toFixed(3));
}
