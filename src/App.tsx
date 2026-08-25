import { FormEvent, useEffect, useMemo, useState } from "react";

type Expense = { id: number; amount: number; date: string; paymentMethod: string; paidBy: string; category: string; note: string };
type Order = { id: number; customer: string; company: string; date: string; timberType: string; quantityTons: number; soldTons: number; unitPrice: number; paidAmount: number; status: string };
type Timber = { id: number; name: string; wholePrice: number; sawnPrice: number; stockTons: number };
type Tax = { id: number; date: string; description: string; amount: number; note: string };
type AppData = { expenses: Expense[]; orders: Order[]; timber: Timber[]; taxes: Tax[] };
type Totals = { capital: number; expense: number; tax: number; sales: number; received: number; tons: number; soldTons: number; balance: number; due: number };
type AuthUser = { username: string; role: "admin" | "user" };

const emptyData: AppData = { expenses: [], orders: [], timber: [], taxes: [] };
const money = (value: number) => new Intl.NumberFormat("my-MM").format(value) + " ကျပ်";
const number = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Yangon" });
const displayDate = () => new Intl.DateTimeFormat("my-MM", { dateStyle: "full", timeZone: "Asia/Yangon" }).format(new Date());
const navItems = [
  ["dashboard", "ခြုံငုံကြည့်ရန်", "Dashboard", "▦"], ["expenses", "အသုံးစရိတ်", "Expenses", "↗"],
  ["orders", "အော်ဒါများ", "Orders", "▤"], ["sold", "ရောင်းပြီးအော်ဒါ", "Sold Orders", "✓"], ["inventory", "သစ်စာရင်း", "Inventory", "▥"],
  ["reports", "စာရင်းချုပ်", "Reports", "≡"],
] as const;

export default function Home() {
  const [auth, setAuth] = useState<AuthUser | null | undefined>(undefined);
  const [data, setData] = useState<AppData>(emptyData);
  const [active, setActive] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"expense" | "order" | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    try {
      const response = await fetch("/api/accounting", { credentials: "include" });
      if (!response.ok) throw new Error("စာရင်းများကို ဖတ်၍မရသေးပါ။");
      setData(await response.json()); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "အမှားတစ်ခု ဖြစ်နေပါသည်။"); }
    finally { setLoading(false); }
  }
  useEffect(() => { (async () => { const response = await fetch("/api/auth", { credentials: "include" }); if (response.ok) { const result = await response.json(); setAuth(result.user); if (result.user.role !== "admin") setActive("expenses"); await loadData(); } else { setAuth(null); setLoading(false); } })(); }, []);

  const totals = useMemo<Totals>(() => {
    const capital = 5_000_000;
    const expense = data.expenses.reduce((s, r) => s + Number(r.amount), 0);
    // Tax/support records are kept for reference only. They are already included
    // in the Insurance expense and must not be deducted a second time.
    const tax = 0;
    const sales = data.orders.reduce((s, r) => s + Number(r.soldTons || 0) * Number(r.unitPrice), 0);
    const received = data.orders.reduce((s, r) => s + Number(r.paidAmount), 0);
    const tons = data.orders.reduce((s, r) => s + Number(r.quantityTons), 0);
    const soldTons = data.orders.reduce((s, r) => s + Number(r.soldTons || 0), 0);
    return { capital, expense, tax, sales, received, tons, soldTons, balance: capital + received - expense, due: sales - received };
  }, [data]);

  async function saveRecord(type: "expense" | "order", payload: Record<string, FormDataEntryValue>) {
    setSaving(true);
    try {
      const response = await fetch("/api/accounting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, ...payload }) });
      if (!response.ok) throw new Error("စာရင်းကို သိမ်း၍မရပါ။");
      await loadData(); setModal(null);
    } catch (e) { setError(e instanceof Error ? e.message : "သိမ်းဆည်းရာတွင် အမှားဖြစ်နေပါသည်။"); }
    finally { setSaving(false); }
  }

  async function logout() { await fetch("/api/auth", { method: "DELETE", credentials: "include" }); setData(emptyData); setAuth(null); setActive("dashboard"); }

  if (auth === undefined) return <div className="auth-loading"><span className="brand-mark">သ</span><p>သစ်စာရင်းအင်း ဖွင့်နေပါသည်…</p></div>;
  if (auth === null) return <LoginScreen onLogin={async user => { setAuth(user); setActive(user.role === "admin" ? "dashboard" : "expenses"); setLoading(true); await loadData(); }} />;
  const visibleNav = auth.role === "admin" ? navItems : navItems.filter(item => item[0] !== "dashboard");

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">သ</span><div><strong>သစ်စာရင်းအင်း</strong><small>Timber Accounting</small></div></div>
      <nav>{visibleNav.map(([id, mm, en, icon]) => <button key={id} className={active === id ? "active" : ""} onClick={() => setActive(id)}><span>{icon}</span><span>{mm}<small>{en}</small></span></button>)}</nav>
      {auth.role === "admin" && <div className="side-card"><small>လက်ရှိလုပ်ငန်းငွေ</small><strong>{money(totals.balance)}</strong><span>စာရင်းနောက်ဆုံးအခြေအနေ</span></div>}
      <div className={`profile ${auth.role !== "admin" ? "profile-bottom" : ""}`}><span>{auth.role === "admin" ? "AD" : "US"}</span><div><strong>{auth.username}</strong><small>{auth.role === "admin" ? "Administrator" : "Normal User"}</small></div><button onClick={logout} title="Logout">ထွက်ရန်</button></div>
    </aside>
    <section className="content">
      <header><div><p>{displayDate()}</p><h1>{active === "dashboard" ? "လုပ်ငန်းစာရင်း အနှစ်ချုပ်" : visibleNav.find(n => n[0] === active)?.[1]}</h1></div><div className="header-actions"><button className="secondary" onClick={() => setModal("order")}>＋ အော်ဒါအသစ်</button><button className="primary" onClick={() => setModal("expense")}>＋ အသုံးစရိတ်ထည့်ရန်</button></div></header>
      {error && <div className="alert">{error}<button onClick={loadData}>ပြန်စမ်းမည်</button></div>}
      {loading ? <div className="loading">စာရင်းများ ဖတ်နေပါသည်…</div> : <>
        {auth.role === "admin" && active === "dashboard" && <Dashboard data={data} totals={totals} setActive={setActive} />}
        {active === "expenses" && <Expenses rows={data.expenses} total={totals.expense} open={() => setModal("expense")} />}
        {active === "orders" && <Orders rows={data.orders} expense={totals.expense} open={() => setModal("order")} refresh={loadData} />}
        {active === "sold" && <SoldOrders rows={data.orders} expense={totals.expense} />}
        {active === "inventory" && <Inventory rows={data.timber} />}
        {active === "reports" && <Reports data={data} totals={totals} isAdmin={auth.role === "admin"} />}
      </>}
    </section>
    {modal && <RecordModal type={modal} timber={data.timber} saving={saving} close={() => setModal(null)} save={saveRecord} />}
  </main>;
}

function LoginScreen({ onLogin }: { onLogin: (user: AuthUser) => Promise<void> }) {
  const [username, setUsername] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); setError(""); try { const response = await fetch("/api/auth", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) }); if (!response.ok) { setError("Username သို့မဟုတ် Password မမှန်ပါ။"); return; } const result = await response.json(); await onLogin(result.user); } finally { setBusy(false); } }
  return <main className="login-page"><section className="login-brand"><div className="login-logo">သ</div><p>Timber Accounting System</p><h1>သစ်စာရင်းအင်း</h1><span>အော်ဒါ၊ အသုံးစရိတ်၊ ကုန်လက်ကျန်နှင့် အမြတ်စာရင်းများကို လုံခြုံစွာ စီမံခန့်ခွဲပါ။</span><div className="grain" /></section><section className="login-panel"><form onSubmit={submit}><div className="login-title"><small>SECURE ACCESS</small><h2>အကောင့်ဝင်ရန်</h2><p>သင့် username နှင့် password ကို ထည့်ပါ</p></div>{error && <div className="login-error">{error}</div>}<label>Username<input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required placeholder="Username" /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Password" /></label><button className="login-button" disabled={busy}>{busy ? "ဝင်နေပါသည်…" : "အကောင့်ဝင်မည် →"}</button><p className="login-note">ခွင့်ပြုထားသော ဝန်ထမ်းများသာ ဝင်ရောက်နိုင်ပါသည်။</p></form></section></main>;
}

function Dashboard({ data, totals, setActive }: { data: AppData; totals: Totals; setActive: (v: string) => void }) {
  const recent = data.expenses.slice(0, 5);
  const partner = data.expenses.reduce<Record<string, number>>((a, e) => ({ ...a, [e.paidBy]: (a[e.paidBy] || 0) + Number(e.amount) }), {});
  return <><div className="stat-grid">
    <Stat label="စုစုပေါင်း မတည်ငွေ" value={money(totals.capital)} meta="အိုက်ပီ ၂၅ သိန်း • အိုက် နောင့် ၂၅ သိန်း" tone="green" />
    <Stat label="လက်ရှိလက်ကျန်ငွေ" value={money(totals.balance)} meta="ငွေဝင်/ငွေထွက် တွက်ပြီး" tone="blue" />
    <Stat label="စုစုပေါင်း အသုံးစရိတ်" value={money(totals.expense)} meta="အာမခံတွင် အခွန်ပါဝင်ပြီး" tone="amber" />
    <Stat label="ရရန်ကျန်ငွေ" value={money(Math.max(0, totals.due))} meta={`${data.orders.length} အော်ဒါ • ${number(totals.tons)} တန်`} tone="rose" />
  </div><div className="dashboard-grid">
    <section className="panel wide"><PanelTitle mm="မကြာသေးမီ အသုံးစရိတ်များ" en="Recent expenses" action="အားလုံးကြည့်ရန် →" onClick={() => setActive("expenses")} /><ExpenseTable rows={recent} /></section>
    <section className="panel"><PanelTitle mm="ငွေအရင်းအမြစ်အလိုက်" en="Fund sources" />{["အိုက်ပီ", "အိုက် နောင့်", "မတည်ငွေ"].map((name, i) => { const spent = partner[name] || 0; const isFund = name === "မတည်ငွေ"; return <div className="partner" key={name}><span className={i === 1 ? "avatar purple" : "avatar"}>{i === 0 ? "ပ" : i === 1 ? "န" : "မ"}</span><div><strong>{name}{isFund ? " (Capital Fund)" : ""}</strong><small>{isFund ? "ယခုနောက်ပိုင်း အသုံးစရိတ်" : "ယခင်နေ့ အသုံးစရိတ်"} {money(spent)}</small><div className="progress"><i style={{ width: `${Math.min(100, spent / 50000)}%` }} /></div></div><b>{isFund ? money(totals.balance) : money(2_500_000 - spent)}</b></div> })}</section>
    <section className="panel wide"><PanelTitle mm="အော်ဒါ အခြေအနေ" en="Order pipeline" action="အသေးစိတ် →" onClick={() => setActive("orders")} /><div className="order-summary"><div><span>စုစုပေါင်းပမာဏ</span><strong>{number(totals.tons)} တန်</strong></div><div><span>ရောင်းရငွေ</span><strong>{money(totals.sales)}</strong></div><div><span>လက်ခံရရှိငွေ</span><strong>{money(totals.received)}</strong></div></div></section>
    <section className="panel"><PanelTitle mm="အမြန်လုပ်ဆောင်ရန်" en="Quick actions" /><div className="quick">{[["expenses","↗","အသုံးစရိတ်"],["orders","▤","အော်ဒါ"],["sold","✓","ရောင်းပြီး"],["reports","≡","စာရင်းချုပ်"]].map(x => <button key={x[0]} onClick={() => setActive(x[0])}>{x[1]}<span>{x[2]}</span></button>)}</div></section>
  </div></>;
}
function PanelTitle({ mm, en, action, onClick }: { mm: string; en: string; action?: string; onClick?: () => void }) { return <div className="panel-title"><div><h2>{mm}</h2><p>{en}</p></div>{action && <button onClick={onClick}>{action}</button>}</div>; }
function Stat({ label, value, meta, tone }: { label: string; value: string; meta: string; tone: string }) { return <article className={`stat ${tone}`}><div className="stat-icon">◫</div><span>{label}</span><strong>{value}</strong><small>{meta}</small></article>; }
function ExpenseTable({ rows }: { rows: Expense[] }) { return <div className="table-wrap"><table><thead><tr><th>ရက်စွဲ</th><th>အကြောင်းအရာ</th><th>ပေးချေသူ</th><th>ငွေပေးနည်း</th><th>ပမာဏ</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td>{r.date}</td><td><b>{r.category}</b><small>{r.note || "—"}</small></td><td>{r.paidBy}</td><td><span className="tag">{r.paymentMethod}</span></td><td><strong>{money(r.amount)}</strong></td></tr>)}</tbody></table>{!rows.length && <Empty />}</div>; }
function Expenses({ rows, total, open }: { rows: Expense[]; total: number; open: () => void }) { return <section className="panel page-panel"><div className="panel-title"><div><h2>လုပ်ငန်းအသုံးစရိတ်</h2><p>စုစုပေါင်း {money(total)}</p></div><button className="primary small" onClick={open}>＋ အသစ်ထည့်ရန်</button></div><ExpenseTable rows={rows} /></section>; }
function Orders({ rows, expense, open, refresh }: { rows: Order[]; expense: number; open: () => void; refresh: () => Promise<void> }) {
  const tons = rows.reduce((s, r) => s + Number(r.quantityTons), 0);
  const soldTons = rows.reduce((s, r) => s + Number(r.soldTons || 0), 0); const leftTons = tons - soldTons;
  const sales = rows.reduce((s, r) => s + Number(r.soldTons || 0) * Number(r.unitPrice), 0);
  const average = soldTons ? sales / soldTons : 0;
  const netProfit = sales - expense;
  return <><div className="sales-analysis"><Stat label="အော်ဒါတန်ချိန်" value={`${number(tons)} တန်`} meta={`${rows.length} အော်ဒါမှ`} tone="blue" /><Stat label="ရောင်းပြီးတန်ချိန်" value={`${number(soldTons)} တန်`} meta={`ပျမ်းမျှဈေး ${money(average)}`} tone="green" /><Stat label="ရောင်းရန်ကျန်" value={`${number(leftTons)} တန်`} meta="မပြီးသေးသော တန်ချိန်" tone="amber" /><Stat label="အသားတင်အမြတ်" value={money(netProfit)} meta={`ရောင်းပြီးငွေ ${money(sales)} − အသုံးစရိတ်`} tone={netProfit >= 0 ? "green" : "rose"} /></div><section className="panel page-panel"><div className="panel-title"><div><h2>လက်ခံရရှိသော အော်ဒါများ</h2><p>တစ်တန်ဈေးနှင့် ယခုအထိ ရောင်းပြီးတန်ကို ထည့်ပါ</p></div><button className="primary small" onClick={open}>＋ အော်ဒါအသစ်</button></div><div className="table-wrap"><table><thead><tr><th>ရက်စွဲ</th><th>ဖောက်သည်/ကုမ္ပဏီ</th><th>အော်ဒါတန်</th><th>ရောင်းပြီးတန်</th><th>ကျန်တန်</th><th>တစ်တန်ဈေး</th><th>ရောင်းရငွေ</th><th>အခြေအနေ</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td>{r.date}</td><td><b>{r.customer}</b><small>{r.company} • {r.timberType || "သစ်အမျိုးအစားမသတ်မှတ်ရ"}</small></td><td>{number(r.quantityTons)} တန်</td><td><SoldTonsEditor order={r} refresh={refresh} /></td><td><strong>{number(Math.max(0, r.quantityTons - (r.soldTons || 0)))} တန်</strong></td><td><OrderPrice order={r} refresh={refresh} /></td><td><strong>{r.unitPrice && r.soldTons ? money(r.soldTons * r.unitPrice) : "—"}</strong></td><td><span className={`status ${r.status.toLowerCase()}`}>{r.status}</span></td></tr>)}</tbody></table>{!rows.length && <Empty />}</div></section></>;
}
function OrderPrice({ order, refresh }: { order: Order; refresh: () => Promise<void> }) {
  const [price, setPrice] = useState(String(order.unitPrice || "")); const [saving, setSaving] = useState(false);
  async function update() { const value = Number(price); if (!(value >= 0)) return; setSaving(true); try { const r = await fetch("/api/accounting", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: order.id, unitPrice: value }) }); if (r.ok) await refresh(); } finally { setSaving(false); } }
  return <div className="price-edit"><input aria-label={`${order.customer} တစ်တန်ဈေး`} type="number" min="0" value={price} placeholder="ဈေးထည့်ရန်" onChange={e => setPrice(e.target.value)} /><button onClick={update} disabled={saving}>{saving ? "…" : "သိမ်း"}</button></div>;
}
function SoldTonsEditor({ order, refresh }: { order: Order; refresh: () => Promise<void> }) {
  const [value, setValue] = useState(String(order.soldTons || "")); const [saving, setSaving] = useState(false);
  async function update() { const soldTons = Number(value || 0); if (soldTons < 0 || soldTons > order.quantityTons) return; setSaving(true); try { const r = await fetch("/api/accounting", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: order.id, soldTons }) }); if (r.ok) await refresh(); } finally { setSaving(false); } }
  return <div className="tons-edit"><input aria-label={`${order.customer} ရောင်းပြီးတန်`} type="number" min="0" max={order.quantityTons} step="0.01" value={value} placeholder="0" onChange={e => setValue(e.target.value)} /><button onClick={update} disabled={saving}>{saving ? "…" : "သိမ်း"}</button></div>;
}
function SoldOrders({ rows, expense }: { rows: Order[]; expense: number }) {
  const sold = rows.filter(r => Number(r.soldTons || 0) > 0);
  const tons = sold.reduce((s, r) => s + Number(r.soldTons || 0), 0); const sales = sold.reduce((s, r) => s + Number(r.soldTons || 0) * Number(r.unitPrice), 0); const profit = sales - expense;
  return <><div className="sales-analysis sold-analysis"><Stat label="အရောင်းရှိသော အော်ဒါ" value={`${sold.length} စောင်`} meta="တစ်စိတ်တစ်ပိုင်းအပါအဝင်" tone="green" /><Stat label="ရောင်းပြီး တန်ချိန်" value={`${number(tons)} တန်`} meta="အမှန်တကယ် ရောင်းပြီး" tone="blue" /><Stat label="ရရှိသော ရောင်းရငွေ" value={money(sales)} meta="ရောင်းပြီးတန် × တစ်တန်ဈေး" tone="green" /><Stat label="အသားတင်အမြတ်" value={money(profit)} meta={`ရောင်းရငွေ − အသုံးစရိတ် ${money(expense)}`} tone={profit >= 0 ? "green" : "rose"} /></div><section className="panel page-panel"><PanelTitle mm="ရောင်းထားသော အော်ဒါများ" en="Partial and completed sales" /><div className="table-wrap"><table><thead><tr><th>ရက်စွဲ</th><th>ဖောက်သည်/ကုမ္ပဏီ</th><th>အော်ဒါတန်</th><th>ရောင်းပြီးတန်</th><th>ကျန်တန်</th><th>တစ်တန်ဈေး</th><th>ရောင်းရငွေ</th></tr></thead><tbody>{sold.map(r => <tr key={r.id}><td>{r.date}</td><td><b>{r.customer}</b><small>{r.company}</small></td><td>{number(r.quantityTons)} တန်</td><td>{number(r.soldTons)} တန်</td><td>{number(Math.max(0, r.quantityTons - r.soldTons))} တန်</td><td>{money(r.unitPrice)}</td><td><strong>{money(r.soldTons * r.unitPrice)}</strong></td></tr>)}</tbody></table>{!sold.length && <div className="empty sold-empty"><strong>ရောင်းထားသောတန် မရှိသေးပါ</strong><span>Orders ထဲတွင် တစ်တန်ဈေးနှင့် ရောင်းပြီးတန်ကို ထည့်ပါ။ အရောင်းနှင့်အမြတ် ဒီနေရာတွင် ပေါ်လာပါမည်။</span></div>}</div></section></>;
}
function Inventory({ rows }: { rows: Timber[] }) { return <div className="inventory-grid">{rows.map(r => <article className="timber-card" key={r.id}><div className="wood-mark">{r.name.slice(0, 1)}</div><div><p>သစ်အမျိုးအစား</p><h2>{r.name}</h2></div><dl><div><dt>အလုံးဈေး</dt><dd>{r.wholePrice ? money(r.wholePrice) : "—"}</dd></div><div><dt>ခွဲသားဈေး</dt><dd>{r.sawnPrice ? money(r.sawnPrice) : "—"}</dd></div><div><dt>လက်ကျန်</dt><dd>{number(r.stockTons)} တန်</dd></div></dl></article>)}</div>; }
function Reports({ data, totals, isAdmin }: { data: AppData; totals: Totals; isAdmin: boolean }) { const profit = totals.sales - totals.expense; const average = totals.soldTons ? totals.sales / totals.soldTons : 0; return <div className="report-grid"><section className="panel"><PanelTitle mm="ငွေကြေးစာရင်းချုပ်" en="Financial summary" /><div className="report-lines">{isAdmin && <p><span>မတည်ငွေ</span><b>{money(totals.capital)}</b></p>}<p><span>ရောင်းပြီးတန်မှ ရောင်းရငွေ</span><b>{money(totals.sales)}</b></p><p><span>အသုံးစရိတ် (အာမခံ/အခွန် ပါပြီး)</span><b className="negative">− {money(totals.expense)}</b></p><p className="total"><span>အသားတင်အမြတ်</span><b>{money(profit)}</b></p></div></section><section className="panel"><PanelTitle mm="အရောင်း ခွဲခြမ်းစိတ်ဖြာမှု" en="Sales analysis" /><div className="report-kpis"><div><span>{data.orders.length}</span><small>အော်ဒါ</small></div><div><span>{number(totals.soldTons)}</span><small>ရောင်းပြီးတန်</small></div><div><span>{money(average)}</span><small>ပျမ်းမျှတစ်တန်ဈေး</small></div><div><span>{money(profit)}</span><small>အသားတင်အမြတ်</small></div></div></section></div>; }
function Empty() { return <div className="empty">စာရင်းမရှိသေးပါ။</div>; }

function RecordModal({ type, timber, saving, close, save }: { type: "expense" | "order"; timber: Timber[]; saving: boolean; close: () => void; save: (t: "expense" | "order", p: Record<string, FormDataEntryValue>) => void }) {
  function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); save(type, Object.fromEntries(new FormData(e.currentTarget).entries())); }
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && close()}><form className="modal" onSubmit={submit}><div className="modal-head"><div><p>{type === "expense" ? "New expense" : "New order"}</p><h2>{type === "expense" ? "အသုံးစရိတ်အသစ် ထည့်ရန်" : "အော်ဒါအသစ် လက်ခံရန်"}</h2></div><button type="button" onClick={close}>×</button></div>
    {type === "expense" ? <div className="form-grid"><label>ပမာဏ (ကျပ်)<input name="amount" type="number" min="1" required placeholder="ဥပမာ 50000" /></label><label>ရက်စွဲ<input name="date" type="date" required defaultValue={today()} /></label><label>ငွေပေးချေမှု<select name="paymentMethod"><option>ငွေသား</option><option>KPay</option><option>WavePay</option><option>ဘဏ်လွှဲ</option></select></label><label>ငွေအရင်းအမြစ်<select name="paidBy" defaultValue="မတည်ငွေ"><option value="မတည်ငွေ">မတည်ငွေ (Capital Fund)</option><option value="အိုက်ပီ">အိုက်ပီ — ယခင်စာရင်းအတွက်</option><option value="အိုက် နောင့်">အိုက် နောင့် — ယခင်စာရင်းအတွက်</option></select></label><label className="full fund-note">ယခုနောက်ပိုင်း အသုံးစရိတ်များအတွက် “မတည်ငွေ” ကို အသုံးပြုပါ။</label><label className="full">အသုံးစရိတ်အမျိုးအစား<input name="category" required placeholder="ဥပမာ သယ်ယူပို့ဆောင်ခ" /></label><label className="full">မှတ်ချက်<textarea name="note" placeholder="လိုအပ်လျှင် ရေးပါ" /></label></div> : <div className="form-grid"><label>ဖောက်သည်အမည်<input name="customer" required /></label><label>ကုမ္ပဏီ/လုပ်ငန်း<input name="company" /></label><label>ရက်စွဲ<input name="date" type="date" required defaultValue={today()} /></label><label>သစ်အမျိုးအစား<select name="timberType"><option value="">ရွေးချယ်ရန်</option>{timber.map(t => <option key={t.id}>{t.name}</option>)}</select></label><label>အရေအတွက် (တန်)<input name="quantityTons" type="number" step="0.01" min="0.01" required /></label><label>တစ်တန်ဈေး<input name="unitPrice" type="number" min="0" defaultValue="0" /></label><label>လက်ခံပြီးငွေ<input name="paidAmount" type="number" min="0" defaultValue="0" /></label><label>အခြေအနေ<select name="status"><option>New</option><option>Processing</option><option>Sold</option><option>Paid</option></select></label></div>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={close}>မလုပ်တော့ပါ</button><button className="primary" disabled={saving}>{saving ? "သိမ်းနေသည်…" : "စာရင်းသိမ်းမည်"}</button></div></form></div>;
}
