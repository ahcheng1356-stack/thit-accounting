const rounded = value => Number(Number(value || 0).toFixed(3));
const locationKey = value => String(value || "").trim().toLocaleLowerCase();

// A transportation row is a route leg, not necessarily a separate load. For each
// connected route, count the tons leaving its origin(s). This makes A -> B (15t)
// plus B -> C (15t) one 15t load, while two A -> B loads still total 30t.
export function transportedTons(rows) {
  const edges = rows
    .map(row => row?.note && !row.fromLocation ? JSON.parse(row.note) : row)
    .map(row => ({ from:locationKey(row.fromLocation), to:locationKey(row.toLocation), tons:Number(row.tons) }))
    .filter(row => row.from && row.to && row.tons > 0);
  const unseen = new Set(edges.map((_, index) => index));
  let total = 0;

  while (unseen.size) {
    const first = unseen.values().next().value;
    unseen.delete(first);
    const component = [edges[first]];
    const locations = new Set([edges[first].from, edges[first].to]);
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const index of [...unseen]) {
        const edge = edges[index];
        if (locations.has(edge.from) || locations.has(edge.to)) {
          unseen.delete(index); component.push(edge);
          locations.add(edge.from); locations.add(edge.to); expanded = true;
        }
      }
    }

    const destinations = new Set(component.map(edge => edge.to));
    const sourceTons = component
      .filter(edge => !destinations.has(edge.from))
      .reduce((sum, edge) => sum + edge.tons, 0);
    if (sourceTons > 0) total += sourceTons;
    else {
      const outgoing = new Map();
      for (const edge of component) outgoing.set(edge.from, (outgoing.get(edge.from) || 0) + edge.tons);
      total += Math.max(0, ...outgoing.values());
    }
  }
  return rounded(total);
}

export function transportedTonsByOrder(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const details = row?.note && !row.fromLocation ? JSON.parse(row.note) : row;
    const orderId = Number(details.orderId || 0);
    if (orderId > 0) grouped.set(orderId, [...(grouped.get(orderId) || []), details]);
  }
  return new Map([...grouped].map(([orderId, records]) => [orderId, transportedTons(records)]));
}

// Sales are entered on the order. Route legs only validate against those sales;
// they must never increase or reverse sold_tons, including during Sheets sync.
export async function validateTransportationChange(supabase, currentRows, nextRows) {
  const detailsOf = row => JSON.parse(row.note);
  const signature = row => {
    const d = detailsOf(row);
    return JSON.stringify([Number(d.orderId), locationKey(d.fromLocation), locationKey(d.toLocation), Number(d.tons)]);
  };
  const current = new Map(currentRows.map(row => [Number(row.id), signature(row)]));
  const changed = nextRows.filter(row => !row.id || current.get(Number(row.id)) !== signature(row));
  const orderIds = new Set(changed.map(row => Number(detailsOf(row).orderId)));
  const totals = transportedTonsByOrder(nextRows);
  for (const orderId of orderIds) {
    if (!(orderId > 0)) throw new Error("Select a sold order for transportation");
    const { data: order, error } = await supabase.from("orders").select("id,customer,sold_tons").eq("id", orderId).maybeSingle();
    if (error) throw error;
    if (!order) throw new Error(`Linked order #${orderId} no longer exists. Select another sold order.`);
    const sold = Number(order.sold_tons || 0);
    if (!(sold > 0)) throw new Error(`Record sold tons on order #${orderId} before adding transportation.`);
    const rows = nextRows.filter(row => Number(detailsOf(row).orderId) === orderId);
    const outgoing = new Map();
    for (const row of rows) {
      const d = detailsOf(row), tons = Number(d.tons), from = locationKey(d.fromLocation);
      if (!Number.isFinite(tons) || tons <= 0) throw new Error("Transportation tons must be a positive number");
      outgoing.set(from, rounded((outgoing.get(from) || 0) + tons));
    }
    if ((totals.get(orderId) || 0) > sold || Math.max(...outgoing.values()) > sold) {
      throw new Error(`Transportation exceeds the ${sold} sold tons on order #${orderId}. For the next leg, start from the previous destination.`);
    }
    for (const row of rows) row.note = JSON.stringify({ ...detailsOf(row), orderCustomer: order.customer, calculationVersion: 3 });
  }
}
