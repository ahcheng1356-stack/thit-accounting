import { FormEvent, useEffect, useMemo, useState } from "react";
import { financialTotals } from "./financialTotals";
import { transportedTons } from "./transportationTotals";

type Expense = { id: number; amount: number; date: string | null; paymentMethod: string; paidBy: string; category: string; note: string };
type Order = { id: number; customer: string; company: string; date: string; timberType: string; quantityTons: number; soldTons: number; unitPrice: number; paidAmount: number; status: string };
type Timber = { id: number; name: string; wholePrice: number; sawnPrice: number; stockTons: number };
type Tax = { id: number; date: string; description: string; amount: number; note: string };
type TimberDeal = { id: number; date: string; timberType: string; seller: string; buyer: string; timberDetails: string; dealDetails: string; advanceDeposit: number; guideFee: number; guideNote: string; note: string };
type Transportation = { id: number; date: string; fromLocation: string; toLocation: string; tons: number; totalPrice: number; note: string; orderId: number | null; orderCustomer: string };
type RecordType = "expense" | "order" | "timberDeal" | "transportation";
type EditableRecord = Expense | Order | TimberDeal | Transportation;
type ModalState = { type: RecordType; record?: EditableRecord };
type AppData = { expenses: Expense[]; orders: Order[]; timber: Timber[]; taxes: Tax[]; timberDeals: TimberDeal[]; transportation: Transportation[]; sheetSync?: { configured: boolean; error?: string; capital?: number; warnings?: string[] } };
type Totals = { capital: number; expense: number; transportation: number; tax: number; sales: number; received: number; tons: number; soldTons: number; balance: number; due: number; profit: number; projectedBalance: number };
type AuthUser = { username: string; role: "admin" | "user" };

const emptyData: AppData = { expenses: [], orders: [], timber: [], taxes: [], timberDeals: [], transportation: [] };
const money = (value: number) => new Intl.NumberFormat("my-MM").format(value) + " ကျပ်";
const number = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Yangon" });
const displayDate = () => new Intl.DateTimeFormat("my-MM", { dateStyle: "full", timeZone: "Asia/Yangon" }).format(new Date());
const navItems = [
  ["dashboard", "ခြုံငုံကြည့်ရန်", "Dashboard", "▦"], ["expenses", "အသုံးစရိတ်", "Expenses", "↗"],
  ["orders", "အော်ဒါများ", "Orders", "▤"], ["sold", "ရောင်းပြီးအော်ဒါ", "Sold Orders", "✓"], ["inventory", "သစ်စာရင်း", "Inventory", "▥"],
  ["timber-deals", "သစ်ရောင်းဝယ်မှတ်တမ်း", "Timber Deals", "⌑"],
  ["transportation", "သယ်ယူပို့ဆောင်ရေး", "Transportation", "↔"],
  ["reports", "စာရင်းချုပ်", "Reports", "≡"],
] as const;

export default function Home() {
  const [auth, setAuth] = useState<AuthUser | null | undefined>(undefined);
  const [data, setData] = useState<AppData>(emptyData);
  const [active, setActive] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  async function loadData() {
    try {
      const response = await fetch("/api/accounting", { credentials: "include" });
      if (!response.ok) throw new Error("စာရင်းများကို ဖတ်၍မရသေးပါ။");
      const result: AppData = await response.json();
      const syncProblem = result.sheetSync?.error || result.sheetSync?.warnings?.[0];
      setData(result); setError(syncProblem ? `Google Sheets sync: ${syncProblem}` : "");
    } catch (e) { setError(e instanceof Error ? e.message : "အမှားတစ်ခု ဖြစ်နေပါသည်။"); }
    finally { setLoading(false); }
  }
  useEffect(() => { (async () => { const response = await fetch("/api/auth", { credentials: "include" }); if (response.ok) { const result = await response.json(); setAuth(result.user); if (result.user.role !== "admin") setActive("expenses"); await loadData(); } else { setAuth(null); setLoading(false); } })(); }, []);

  const totals = useMemo<Totals>(() => {
    const capital = Number(data.sheetSync?.capital ?? 5_000_000);
    const recordedExpense = data.expenses.reduce((s, r) => s + Number(r.amount), 0);
    const transportation = data.transportation.reduce((s, r) => s + Number(r.totalPrice), 0);
    const expense = recordedExpense + transportation;
    // Tax/support records are kept for reference only. They are already included
    // in the Insurance expense and must not be deducted a second time.
    const tax = 0;
    const financial = financialTotals(data.orders, capital, expense);
    const tons = data.orders.reduce((s, r) => s + Number(r.quantityTons), 0);
    const soldTons = data.orders.reduce((s, r) => s + Number(r.soldTons || 0), 0);
    return { capital, expense, transportation, tax, tons, soldTons, ...financial };
  }, [data]);

  async function saveRecord(type: RecordType, payload: Record<string, FormDataEntryValue>, id?: number) {
    setSaving(true);
    try {
      const response = await fetch("/api/accounting", { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, id, ...payload }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "စာရင်းကို သိမ်း၍မရပါ။");
      await loadData(); setModal(null);
    } catch (e) { setError(e instanceof Error ? e.message : "သိမ်းဆည်းရာတွင် အမှားဖြစ်နေပါသည်။"); }
    finally { setSaving(false); }
  }

  async function deleteRecord(type: RecordType, id: number) {
    const label = type === "expense" ? "ဤအသုံးစရိတ်စာရင်း" : type === "order" ? "ဤအော်ဒါ" : type === "timberDeal" ? "ဤသစ်ရောင်းဝယ်မှတ်တမ်း" : "ဤသယ်ယူပို့ဆောင်ရေးမှတ်တမ်း";
    if (!window.confirm(`${label}ကို အပြီးဖျက်မည်လား။ ဖျက်ပြီးလျှင် ပြန်ယူ၍မရပါ။`)) return false;
    try {
      const response = await fetch("/api/accounting", { method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, id }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `${label}ကို ဖျက်၍မရပါ။`);
      await loadData();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "ဖျက်ရာတွင် အမှားဖြစ်နေပါသည်။");
      return false;
    }
  }

  async function logout() { await fetch("/api/auth", { method: "DELETE", credentials: "include" }); setData(emptyData); setAuth(null); setActive("dashboard"); }

  if (auth === undefined) return <div className="auth-loading"><span className="brand-mark">သ</span><p>သစ်စာရင်းအင်း ဖွင့်နေပါသည်…</p></div>;
  if (auth === null) return <LoginScreen onLogin={async user => { setAuth(user); setActive(user.role === "admin" ? "dashboard" : "expenses"); setLoading(true); await loadData(); }} />;
  const visibleNav = auth.role === "admin" ? navItems : navItems.filter(item => item[0] !== "dashboard");

  return <main className="app-shell">
    <div className={`sidebar-backdrop ${mobileMenu ? "show" : ""}`} onClick={() => setMobileMenu(false)} />
    <aside className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}>
      <div className="brand"><span className="brand-mark">သ</span><div><strong>သစ်စာရင်းအင်း</strong><small>Timber Accounting</small></div><button className="sidebar-close" onClick={() => setMobileMenu(false)} aria-label="မီနူးပိတ်ရန်">×</button></div>
      <nav>{visibleNav.map(([id, mm, en, icon]) => <button key={id} className={active === id ? "active" : ""} onClick={() => { setActive(id); setMobileMenu(false); }}><span>{icon}</span><span>{mm}<small>{en}</small></span></button>)}</nav>
      {auth.role === "admin" && <div className="side-card"><small>လက်ရှိ ငွေသားလက်ကျန်</small><strong>{money(totals.balance)}</strong><span>အမြတ်/အရှုံး မဟုတ်ပါ</span></div>}
      <div className={`profile ${auth.role !== "admin" ? "profile-bottom" : ""}`}><span>{auth.role === "admin" ? "AD" : "US"}</span><div><strong>{auth.username}</strong><small>{auth.role === "admin" ? "Administrator" : "Normal User"}</small></div><button onClick={logout} title="Logout">ထွက်ရန်</button></div>
    </aside>
    <section className="content">
      <div className="mobile-topbar"><button className="menu-trigger" onClick={() => setMobileMenu(true)} aria-label="မီနူးဖွင့်ရန်" aria-expanded={mobileMenu}><span /><span /><span /></button><div className="mobile-brand"><span className="brand-mark">သ</span><div><strong>သစ်စာရင်းအင်း</strong><small>{auth.username}</small></div></div><span className="mobile-role">{auth.role === "admin" ? "AD" : "US"}</span></div>
      <header><div><p>{displayDate()}</p><h1>{active === "dashboard" ? "လုပ်ငန်းစာရင်း အနှစ်ချုပ်" : visibleNav.find(n => n[0] === active)?.[1]}</h1></div>{auth.role === "admin" && <div className="header-actions"><button className="secondary" onClick={() => setModal({ type:"order" })}>＋ အော်ဒါအသစ်</button><button className="primary" onClick={() => setModal({ type:"expense" })}>＋ အသုံးစရိတ်ထည့်ရန်</button></div>}</header>
      {error && <div className="alert">{error}<button onClick={loadData}>ပြန်စမ်းမည်</button></div>}
      {loading ? <div className="loading">စာရင်းများ ဖတ်နေပါသည်…</div> : <>
        {auth.role === "admin" && active === "dashboard" && <Dashboard data={data} totals={totals} setActive={setActive} />}
        {active === "expenses" && <Expenses rows={data.expenses} total={totals.expense - totals.transportation} open={record => setModal({ type:"expense", record })} onDelete={id => deleteRecord("expense", id)} canEdit={auth.role === "admin"} />}
        {active === "orders" && <Orders rows={data.orders} expense={totals.expense} open={record => setModal({ type:"order", record })} refresh={loadData} onDelete={id => deleteRecord("order", id)} canEdit={auth.role === "admin"} />}
        {active === "sold" && <SoldOrders rows={data.orders} expense={totals.expense} refresh={loadData} canEdit={auth.role === "admin"} />}
        {active === "inventory" && <Inventory rows={data.timber} />}
        {active === "timber-deals" && <TimberDeals rows={data.timberDeals} open={record => setModal({ type:"timberDeal", record })} onDelete={id => deleteRecord("timberDeal", id)} canEdit={auth.role === "admin"} />}
        {active === "transportation" && <TransportationPage orders={data.orders} rows={data.transportation} open={record => setModal({ type:"transportation", record })} onDelete={id => deleteRecord("transportation", id)} canEdit={auth.role === "admin"} />}
        {active === "reports" && <Reports data={data} totals={totals} isAdmin={auth.role === "admin"} />}
      </>}
    </section>
    {modal && <RecordModal key={`${modal.type}-${modal.record?.id || "new"}`} type={modal.type} record={modal.record} timber={data.timber} orders={data.orders} transportation={data.transportation} saving={saving} close={() => setModal(null)} save={saveRecord} />}
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
  partner["မတည်ငွေ"] = (partner["မတည်ငွေ"] || 0) + totals.transportation;
  return <><div className="stat-grid">
    <Stat label="စုစုပေါင်း မတည်ငွေ" value={money(totals.capital)} meta="အိုက်ပီ ၂၅ သိန်း • အိုက် နောင့် ၂၅ သိန်း" tone="green" />
    <Stat label="အရောင်းမှ အမြတ် / အရှုံး" value={money(totals.profit)} meta="ရောင်းပြီးတန် × ဈေး − ကုန်ကျစရိတ်အားလုံး" tone={totals.profit >= 0 ? "green" : "rose"} />
    <Stat label="စုစုပေါင်း အသုံးစရိတ်" value={money(totals.expense)} meta={`သယ်ယူပို့ဆောင်ခ ${money(totals.transportation)} ပါဝင်ပြီး`} tone="amber" />
    <Stat label="ရရန်ကျန်ငွေ" value={money(Math.max(0, totals.due))} meta={`${data.orders.length} အော်ဒါ • ${number(totals.tons)} တန်`} tone="rose" />
    <Stat label="စုစုပေါင်း ရောင်းရငွေ" value={money(totals.sales)} meta={`${number(totals.soldTons)} ရောင်းပြီးတန် × တစ်တန်ဈေး`} tone="green" />
    <Stat label="လက်ခံရရှိပြီးငွေ" value={money(totals.received)} meta="ဖောက်သည်မှ အမှန်တကယ်ပေးပြီးငွေ" tone="blue" />
    <Stat label="လက်ရှိ ငွေသားလက်ကျန်" value={money(totals.balance)} meta="မတည်ငွေ + လက်ခံပြီးငွေ − အသုံးစရိတ်" tone={totals.balance >= 0 ? "blue" : "rose"} />
    <Stat label="ရရန်ငွေအားလုံး ရပြီးလျှင်" value={money(totals.projectedBalance)} meta="ငွေသားလက်ကျန် + ရရန်ကျန်ငွေ" tone="green" />
  </div>
  {totals.due > 0 && <div className="balance-explanation"><div><strong>အရောင်းနှင့် ငွေလက်ခံရရှိမှု</strong><p>ရောင်းပြီးငွေ {money(totals.sales)} အနက် {money(totals.received)} လက်ခံပြီး၊ {money(totals.due)} ရရန်ကျန်ပါသည်။ ငွေရရှိပြီးပါက ရောင်းပြီးအော်ဒါထဲတွင် လက်ခံပြီးငွေကို သိမ်းပါ။</p></div><button className="primary small" onClick={() => setActive("sold")}>လက်ခံပြီးငွေ ထည့်ရန် →</button></div>}
  <div className="dashboard-grid">
    <section className="panel wide"><PanelTitle mm="မကြာသေးမီ အသုံးစရိတ်များ" en="Recent expenses" action="အားလုံးကြည့်ရန် →" onClick={() => setActive("expenses")} /><ExpenseTable rows={recent} /></section>
    <section className="panel"><PanelTitle mm="ငွေအရင်းအမြစ်အလိုက်" en="Fund sources" />{["အိုက်ပီ", "အိုက် နောင့်", "မတည်ငွေ"].map((name, i) => { const spent = partner[name] || 0; const isFund = name === "မတည်ငွေ"; return <div className="partner" key={name}><span className={i === 1 ? "avatar purple" : "avatar"}>{i === 0 ? "ပ" : i === 1 ? "န" : "မ"}</span><div><strong>{name}{isFund ? " (Capital Fund)" : ""}</strong><small>{isFund ? "ယခုနောက်ပိုင်း အသုံးစရိတ်" : "ယခင်နေ့ အသုံးစရိတ်"} {money(spent)}</small><div className="progress"><i style={{ width: `${Math.min(100, spent / 50000)}%` }} /></div></div><b>{isFund ? money(totals.balance) : money(2_500_000 - spent)}</b></div> })}</section>
    <section className="panel wide"><PanelTitle mm="အော်ဒါ အခြေအနေ" en="Order pipeline" action="အသေးစိတ် →" onClick={() => setActive("orders")} /><div className="order-summary"><div><span>စုစုပေါင်းပမာဏ</span><strong>{number(totals.tons)} တန်</strong></div><div><span>ရောင်းရငွေ</span><strong>{money(totals.sales)}</strong></div><div><span>လက်ခံရရှိငွေ</span><strong>{money(totals.received)}</strong></div></div></section>
    <section className="panel"><PanelTitle mm="အမြန်လုပ်ဆောင်ရန်" en="Quick actions" /><div className="quick">{[["expenses","↗","အသုံးစရိတ်"],["orders","▤","အော်ဒါ"],["sold","✓","ရောင်းပြီး"],["reports","≡","စာရင်းချုပ်"]].map(x => <button key={x[0]} onClick={() => setActive(x[0])}>{x[1]}<span>{x[2]}</span></button>)}</div></section>
  </div></>;
}
function PanelTitle({ mm, en, action, onClick }: { mm: string; en: string; action?: string; onClick?: () => void }) { return <div className="panel-title"><div><h2>{mm}</h2><p>{en}</p></div>{action && <button onClick={onClick}>{action}</button>}</div>; }
function Stat({ label, value, meta, tone }: { label: string; value: string; meta: string; tone: string }) { return <article className={`stat ${tone}`}><div className="stat-icon">◫</div><span>{label}</span><strong>{value}</strong><small>{meta}</small></article>; }
function ExpenseTable({ rows, onEdit, onDelete }: { rows: Expense[]; onEdit?: (record: Expense) => void; onDelete?: (id: number) => Promise<boolean> }) { return <div className="table-wrap"><table className="mobile-cards"><thead><tr><th>ရက်စွဲ</th><th>အကြောင်းအရာ</th><th>ပေးချေသူ</th><th>ငွေပေးနည်း</th><th>ပမာဏ</th>{onDelete && <th>လုပ်ဆောင်ချက်</th>}</tr></thead><tbody>{rows.map(r => <tr key={r.id}><td data-label="ရက်စွဲ">{r.date || "—"}</td><td data-label="အကြောင်းအရာ"><b>{r.category}</b><small>{r.note || "—"}</small></td><td data-label="ပေးချေသူ">{r.paidBy}</td><td data-label="ငွေပေးနည်း"><span className="tag">{r.paymentMethod}</span></td><td data-label="ပမာဏ"><strong>{money(r.amount)}</strong></td>{onDelete && <td data-label="လုပ်ဆောင်ချက်"><RecordActions label={r.category} onEdit={() => onEdit?.(r)} onDelete={() => onDelete(r.id)} /></td>}</tr>)}</tbody></table>{!rows.length && <Empty />}</div>; }
function Expenses({ rows, total, open, onDelete, canEdit }: { rows: Expense[]; total: number; open: (record?: Expense) => void; onDelete: (id: number) => Promise<boolean>; canEdit: boolean }) { return <section className="panel page-panel"><div className="panel-title"><div><h2>လုပ်ငန်းအသုံးစရိတ်</h2><p>စုစုပေါင်း {money(total)}</p></div>{canEdit && <button className="primary small" onClick={() => open()}>＋ အသစ်ထည့်ရန်</button>}</div><ExpenseTable rows={rows} onEdit={canEdit ? open : undefined} onDelete={canEdit ? onDelete : undefined} /></section>; }
function Orders({ rows, expense, open, refresh, onDelete, canEdit }: { rows: Order[]; expense: number; open: (record?: Order) => void; refresh: () => Promise<void>; onDelete: (id: number) => Promise<boolean>; canEdit: boolean }) {
  const tons = rows.reduce((s, r) => s + Number(r.quantityTons), 0);
  const soldTons = rows.reduce((s, r) => s + Number(r.soldTons || 0), 0); const leftTons = tons - soldTons;
  const sales = rows.reduce((s, r) => s + Number(r.soldTons || 0) * Number(r.unitPrice), 0);
  const average = soldTons ? sales / soldTons : 0;
  const netProfit = sales - expense;
  return <><div className="sales-analysis"><Stat label="အော်ဒါတန်ချိန်" value={`${number(tons)} တန်`} meta={`${rows.length} အော်ဒါမှ`} tone="blue" /><Stat label="ရောင်းပြီးတန်ချိန်" value={`${number(soldTons)} တန်`} meta={`ပျမ်းမျှဈေး ${money(average)}`} tone="green" /><Stat label="ရောင်းရန်ကျန်" value={`${number(leftTons)} တန်`} meta="မပြီးသေးသော တန်ချိန်" tone="amber" /><Stat label="အသားတင်အမြတ်" value={money(netProfit)} meta={`ရောင်းပြီးငွေ ${money(sales)} − အသုံးစရိတ်`} tone={netProfit >= 0 ? "green" : "rose"} /></div><section className="panel page-panel"><div className="panel-title"><div><h2>လက်ခံရရှိသော အော်ဒါများ</h2><p>{canEdit ? "တစ်တန်ဈေးနှင့် ယခုအထိ ရောင်းပြီးတန်ကို ထည့်ပါ" : "ကြည့်ရှုရန်သာ"}</p></div>{canEdit && <button className="primary small" onClick={() => open()}>＋ အော်ဒါအသစ်</button>}</div><div className="table-wrap"><table className="mobile-cards"><thead><tr><th>ရက်စွဲ</th><th>ဖောက်သည်/ကုမ္ပဏီ</th><th>အော်ဒါတန်</th><th>ရောင်းပြီးတန်</th><th>ကျန်တန်</th><th>တစ်တန်ဈေး</th><th>ရောင်းရငွေ</th><th>အခြေအနေ</th>{canEdit && <th>လုပ်ဆောင်ချက်</th>}</tr></thead><tbody>{rows.map(r => <tr key={r.id}><td data-label="ရက်စွဲ">{r.date}</td><td data-label="ဖောက်သည်"><b>{r.customer}</b><small>{r.company} • {r.timberType || "သစ်အမျိုးအစားမသတ်မှတ်ရ"}</small></td><td data-label="အော်ဒါတန်">{number(r.quantityTons)} တန်</td><td data-label="ရောင်းပြီးတန်">{canEdit ? <SoldTonsEditor order={r} refresh={refresh} /> : `${number(r.soldTons || 0)} တန်`}</td><td data-label="ကျန်တန်"><strong>{number(Math.max(0, r.quantityTons - (r.soldTons || 0)))} တန်</strong></td><td data-label="တစ်တန်ဈေး">{canEdit ? <OrderPrice order={r} refresh={refresh} /> : money(r.unitPrice || 0)}</td><td data-label="ရောင်းရငွေ"><strong>{r.unitPrice && r.soldTons ? money(r.soldTons * r.unitPrice) : "—"}</strong></td><td data-label="အခြေအနေ"><span className={`status ${r.status.toLowerCase()}`}>{r.status}</span></td>{canEdit && <td data-label="လုပ်ဆောင်ချက်"><RecordActions label={r.customer} onEdit={() => open(r)} onDelete={() => onDelete(r.id)} /></td>}</tr>)}</tbody></table>{!rows.length && <Empty />}</div></section></>;
}
function RecordActions({ label, onEdit, onDelete }: { label: string; onEdit: () => void; onDelete: () => Promise<boolean> }) {
  return <div className="record-actions"><button type="button" className="edit-button" aria-label={`${label} ပြင်ဆင်ရန်`} onClick={onEdit}>ပြင်ဆင်ရန်</button><DeleteButton label={label} onDelete={onDelete} /></div>;
}
function DeleteButton({ label, onDelete }: { label: string; onDelete: () => Promise<boolean> }) {
  const [deleting, setDeleting] = useState(false);
  async function remove() { setDeleting(true); try { await onDelete(); } finally { setDeleting(false); } }
  return <button type="button" className="delete-button" aria-label={`${label} ဖျက်ရန်`} onClick={remove} disabled={deleting}>{deleting ? "ဖျက်နေသည်…" : "ဖျက်ရန်"}</button>;
}
function OrderPrice({ order, refresh }: { order: Order; refresh: () => Promise<void> }) {
  const [price, setPrice] = useState(String(order.unitPrice || "")); const [saving, setSaving] = useState(false);
  async function update() { const value = Number(price); if (!(value >= 0)) return; setSaving(true); try { const r = await fetch("/api/accounting", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type:"order", id: order.id, unitPrice: value }) }); if (r.ok) await refresh(); } finally { setSaving(false); } }
  return <div className="price-edit"><input aria-label={`${order.customer} တစ်တန်ဈေး`} type="number" min="0" value={price} placeholder="ဈေးထည့်ရန်" onChange={e => setPrice(e.target.value)} /><button onClick={update} disabled={saving}>{saving ? "…" : "သိမ်း"}</button></div>;
}
function SoldTonsEditor({ order, refresh }: { order: Order; refresh: () => Promise<void> }) {
  const [value, setValue] = useState(String(order.soldTons || "")); const [saving, setSaving] = useState(false);
  async function update() { const soldTons = Number(value || 0); if (soldTons < 0 || soldTons > order.quantityTons) return; setSaving(true); try { const r = await fetch("/api/accounting", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type:"order", id: order.id, soldTons }) }); if (r.ok) await refresh(); } finally { setSaving(false); } }
  return <div className="tons-edit"><input aria-label={`${order.customer} ရောင်းပြီးတန်`} type="number" min="0" max={order.quantityTons} step="0.01" value={value} placeholder="0" onChange={e => setValue(e.target.value)} /><button onClick={update} disabled={saving}>{saving ? "…" : "သိမ်း"}</button></div>;
}
function ReceivedPaymentEditor({ order, refresh }: { order: Order; refresh: () => Promise<void> }) {
  const [value, setValue] = useState(String(order.paidAmount || 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setValue(String(order.paidAmount || 0)), [order.paidAmount]);
  async function update(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError("");
    const paidAmount = Number(value);
    if (!value.trim() || !Number.isFinite(paidAmount) || paidAmount < 0) { setError("လက်ခံပြီးငွေကို မှန်ကန်စွာ ထည့်ပါ။"); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/accounting", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "order", id: order.id, paidAmount }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "လက်ခံပြီးငွေကို သိမ်း၍မရပါ။");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "သိမ်း၍မရပါ။"); }
    finally { setSaving(false); }
  }
  return <form className="payment-editor" onSubmit={update}><label htmlFor={`payment-${order.id}`}>စုစုပေါင်း လက်ခံပြီးငွေ (ကျပ်)</label><div className="price-edit"><input id={`payment-${order.id}`} type="number" min="0" step="0.01" required value={value} onChange={e => setValue(e.target.value)} disabled={saving} /><button disabled={saving}>{saving ? "…" : "သိမ်း"}</button></div><button type="button" className="payment-fill" disabled={saving} onClick={() => setValue(String(Number(order.soldTons) * Number(order.unitPrice)))}>အရောင်းတန်ဖိုးအပြည့် ဖြည့်ရန်</button>{error && <p role="alert">{error}</p>}</form>;
}
function SoldOrders({ rows, expense, refresh, canEdit }: { rows: Order[]; expense: number; refresh: () => Promise<void>; canEdit: boolean }) {
  const sold = rows.filter(r => Number(r.soldTons || 0) > 0);
  const tons = sold.reduce((s, r) => s + Number(r.soldTons || 0), 0); const sales = sold.reduce((s, r) => s + Number(r.soldTons || 0) * Number(r.unitPrice), 0); const profit = sales - expense;
  return <><div className="sales-analysis sold-analysis"><Stat label="အရောင်းရှိသော အော်ဒါ" value={`${sold.length} စောင်`} meta="တစ်စိတ်တစ်ပိုင်းအပါအဝင်" tone="green" /><Stat label="ရောင်းပြီး တန်ချိန်" value={`${number(tons)} တန်`} meta="အမှန်တကယ် ရောင်းပြီး" tone="blue" /><Stat label="ရောင်းရငွေ" value={money(sales)} meta="ရောင်းပြီးတန် × တစ်တန်ဈေး" tone="green" /><Stat label="အသားတင်အမြတ်" value={money(profit)} meta={`ရောင်းရငွေ − အသုံးစရိတ် ${money(expense)}`} tone={profit >= 0 ? "green" : "rose"} /></div><section className="panel page-panel"><PanelTitle mm="ရောင်းထားသော အော်ဒါများ" en="Partial and completed sales" /><div className="table-wrap"><table className="mobile-cards"><thead><tr><th>ရက်စွဲ</th><th>ဖောက်သည်/ကုမ္ပဏီ</th><th>အော်ဒါတန်</th><th>ရောင်းပြီးတန်</th><th>ကျန်တန်</th><th>တစ်တန်ဈေး</th><th>ရောင်းရငွေ</th><th>လက်ခံရရှိပြီးငွေ</th><th>ရရန်ကျန်ငွေ</th></tr></thead><tbody>{sold.map(r => <tr key={r.id}><td data-label="ရက်စွဲ">{r.date}</td><td data-label="ဖောက်သည်"><b>{r.customer}</b><small>{r.company}</small></td><td data-label="အော်ဒါတန်">{number(r.quantityTons)} တန်</td><td data-label="ရောင်းပြီးတန်">{number(r.soldTons)} တန်</td><td data-label="ကျန်တန်">{number(Math.max(0, r.quantityTons - r.soldTons))} တန်</td><td data-label="တစ်တန်ဈေး">{money(r.unitPrice)}</td><td data-label="ရောင်းရငွေ"><strong>{money(r.soldTons * r.unitPrice)}</strong></td><td data-label="လက်ခံရရှိပြီးငွေ">{canEdit ? <ReceivedPaymentEditor order={r} refresh={refresh} /> : money(Number(r.paidAmount))}</td><td data-label="ရရန်ကျန်ငွေ">{money(Math.max(0, Number(r.soldTons) * Number(r.unitPrice) - Number(r.paidAmount)))}</td></tr>)}</tbody></table>{!sold.length && <div className="empty sold-empty"><strong>ရောင်းထားသောတန် မရှိသေးပါ</strong><span>Orders ထဲတွင် တစ်တန်ဈေးနှင့် ရောင်းပြီးတန်ကို ထည့်ပါ။ အရောင်းနှင့်အမြတ် ဒီနေရာတွင် ပေါ်လာပါမည်။</span></div>}</div></section></>;
}
function TimberDeals({ rows, open, onDelete, canEdit }: { rows: TimberDeal[]; open: (record?: TimberDeal) => void; onDelete: (id: number) => Promise<boolean>; canEdit: boolean }) {
  return <section className="panel page-panel"><div className="panel-title"><div><h2>သစ်ရောင်းဝယ်မှတ်တမ်းများ</h2><p>ငွေစာရင်းနှင့် အမြတ်တွက်ချက်မှုတွင် မပါဝင်သော သီးခြားမှတ်တမ်း</p></div>{canEdit && <button className="primary small" onClick={() => open()}>＋ မှတ်တမ်းအသစ်</button>}</div><div className="table-wrap"><table className="mobile-cards timber-deals-table"><thead><tr><th>ရက်စွဲ</th><th>သစ်အမျိုးအစား</th><th>ရောင်းသူ / ဝယ်သူ</th><th>အရေအတွက် / အသေးစိတ်</th><th>ရောင်းဝယ်ပုံ</th><th>ကြိုတင်စရံ</th><th>လိုက်ပြခ</th><th>မှတ်ချက်</th>{canEdit && <th>လုပ်ဆောင်ချက်</th>}</tr></thead><tbody>{rows.map(r => <tr key={r.id}><td data-label="ရက်စွဲ">{r.date}</td><td data-label="သစ်အမျိုးအစား"><strong>{r.timberType || "—"}</strong></td><td data-label="ရောင်းသူ / ဝယ်သူ"><b>{r.seller}</b><small>ဝယ်သူ — {r.buyer}</small></td><td data-label="အရေအတွက် / အသေးစိတ်"><strong>{r.timberDetails}</strong></td><td data-label="ရောင်းဝယ်ပုံ">{r.dealDetails || "—"}</td><td data-label="ကြိုတင်စရံ"><strong>{r.advanceDeposit ? money(r.advanceDeposit) : "—"}</strong></td><td data-label="လိုက်ပြခ"><b>{r.guideFee ? money(r.guideFee) : "—"}</b><small>{r.guideNote || "—"}</small></td><td data-label="မှတ်ချက်">{r.note || "—"}</td>{canEdit && <td data-label="လုပ်ဆောင်ချက်"><RecordActions label={`${r.seller} နှင့် ${r.buyer}`} onEdit={() => open(r)} onDelete={() => onDelete(r.id)} /></td>}</tr>)}</tbody></table>{!rows.length && <Empty />}</div></section>;
}
function TransportationPage({ rows, orders, open, onDelete, canEdit }: { rows: Transportation[]; orders: Order[]; open: (record?: Transportation) => void; onDelete: (id: number) => Promise<boolean>; canEdit: boolean }) {
  const totalTons = transportedTons(rows);
  const totalCost = rows.reduce((sum, row) => sum + Number(row.totalPrice), 0);
  return <><div className="transport-summary"><Stat label="သယ်ယူပို့ဆောင်မှု" value={`${rows.length} ခေါက်`} meta="လမ်းပိုင်းတစ်ခုစီ မှတ်တမ်း" tone="blue" /><Stat label="စုစုပေါင်း တန်ချိန်" value={`${number(totalTons)} တန်`} meta="ဆက်နေသောလမ်းပိုင်းများကို တစ်ကြိမ်သာတွက်သည်" tone="green" /><Stat label="စုစုပေါင်း ကုန်ကျငွေ" value={money(totalCost)} meta="မတည်ငွေမှ အလိုအလျောက်နုတ်မည်" tone="amber" /></div><section className="panel page-panel"><div className="panel-title"><div><h2>သယ်ယူပို့ဆောင်ရေးမှတ်တမ်း</h2><p>အော်ဒါတစ်ခု၏ ဆက်နေသောလမ်းပိုင်းများကို ကုန်တန်ချိန်တစ်ခုတည်းအဖြစ် တွက်ပါမည်</p></div>{canEdit && <button className="primary small" onClick={() => open()}>＋ ခရီးစဉ်အသစ်</button>}</div><div className="table-wrap"><table className="mobile-cards"><thead><tr><th>ရက်စွဲ</th><th>ချိတ်ထားသောအော်ဒါ</th><th>စတင်သည့်နေရာ</th><th>ပို့ဆောင်မည့်နေရာ</th><th>တန်ချိန်</th><th>တစ်ခေါက်စုစုပေါင်းဈေး</th><th>မှတ်ချက်</th>{canEdit && <th>လုပ်ဆောင်ချက်</th>}</tr></thead><tbody>{rows.map(r => <tr key={r.id}><td data-label="ရက်စွဲ">{r.date}</td><td data-label="ချိတ်ထားသောအော်ဒါ">{r.orderId ? <><strong>#{r.orderId}</strong><small>{orders.find(order => order.id === r.orderId)?.customer || r.orderCustomer}</small><small>ရောင်းပြီး {number(Number(orders.find(order => order.id === r.orderId)?.soldTons || 0))} တန်</small></> : <span className="unlinked-order">အော်ဒါမချိတ်ရသေး</span>}</td><td data-label="စတင်သည့်နေရာ"><strong>{r.fromLocation}</strong></td><td data-label="ပို့ဆောင်မည့်နေရာ"><strong>{r.toLocation}</strong></td><td data-label="တန်ချိန်">{number(r.tons)} တန်</td><td data-label="စုစုပေါင်းဈေး"><strong>{money(r.totalPrice)}</strong></td><td data-label="မှတ်ချက်">{r.note || "—"}</td>{canEdit && <td data-label="လုပ်ဆောင်ချက်"><RecordActions label={`${r.fromLocation} မှ ${r.toLocation}`} onEdit={() => open(r)} onDelete={() => onDelete(r.id)} /></td>}</tr>)}</tbody></table>{!rows.length && <Empty />}</div></section></>;
}
function Inventory({ rows }: { rows: Timber[] }) { return <div className="inventory-grid">{rows.map(r => <article className="timber-card" key={r.id}><div className="wood-mark">{r.name.slice(0, 1)}</div><div><p>သစ်အမျိုးအစား</p><h2>{r.name}</h2></div><dl><div><dt>အလုံးဈေး</dt><dd>{r.wholePrice ? money(r.wholePrice) : "—"}</dd></div><div><dt>ခွဲသားဈေး</dt><dd>{r.sawnPrice ? money(r.sawnPrice) : "—"}</dd></div><div><dt>လက်ကျန်</dt><dd>{number(r.stockTons)} တန်</dd></div></dl></article>)}</div>; }
function Reports({ data, totals, isAdmin }: { data: AppData; totals: Totals; isAdmin: boolean }) { const profit = totals.sales - totals.expense; const average = totals.soldTons ? totals.sales / totals.soldTons : 0; const businessExpense=totals.expense-totals.transportation; return <div className="report-grid"><section className="panel"><PanelTitle mm="ငွေကြေးစာရင်းချုပ်" en="Financial summary" /><div className="report-lines">{isAdmin && <p><span>မတည်ငွေ</span><b>{money(totals.capital)}</b></p>}<p><span>ရောင်းပြီးတန်မှ ရောင်းရငွေ</span><b>{money(totals.sales)}</b></p><p><span>လုပ်ငန်းအသုံးစရိတ် (အာမခံ/အခွန် ပါပြီး)</span><b className="negative">− {money(businessExpense)}</b></p><p><span>သယ်ယူပို့ဆောင်ခ (မတည်ငွေမှ)</span><b className="negative">− {money(totals.transportation)}</b></p><p><span>စုစုပေါင်း အသုံးစရိတ်</span><b className="negative">− {money(totals.expense)}</b></p><p className="total"><span>အသားတင်အမြတ်</span><b>{money(profit)}</b></p></div></section><section className="panel"><PanelTitle mm="အရောင်း ခွဲခြမ်းစိတ်ဖြာမှု" en="Sales analysis" /><div className="report-kpis"><div><span>{data.orders.length}</span><small>အော်ဒါ</small></div><div><span>{number(totals.soldTons)}</span><small>ရောင်းပြီးတန်</small></div><div><span>{money(average)}</span><small>ပျမ်းမျှတစ်တန်ဈေး</small></div><div><span>{money(profit)}</span><small>အသားတင်အမြတ်</small></div></div></section></div>; }
function Empty() { return <div className="empty">စာရင်းမရှိသေးပါ။</div>; }

function RecordModal({ type, record, timber, orders, transportation, saving, close, save }: { type: RecordType; record?: EditableRecord; timber: Timber[]; orders: Order[]; transportation: Transportation[]; saving: boolean; close: () => void; save: (t: RecordType, p: Record<string, FormDataEntryValue>, id?: number) => void }) {
  const editing = Boolean(record);
  const initial = (record || {}) as Partial<Expense & Order & TimberDeal & Transportation>;
  const [transportOrderId, setTransportOrderId] = useState(String(initial.orderId || ""));
  const [fromLocation, setFromLocation] = useState(initial.fromLocation || "");
  const [toLocation, setToLocation] = useState(initial.toLocation || "");
  const [transportTons, setTransportTons] = useState(String(initial.tons ?? ""));
  const selectedOrder = orders.find(order => String(order.id) === transportOrderId);
  const previousLegs = transportation.filter(route => String(route.orderId) === transportOrderId && route.id !== initial.id);
  function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); save(type, Object.fromEntries(new FormData(e.currentTarget).entries()), record?.id); }
  const title = editing
    ? type === "expense" ? ["Edit expense", "အသုံးစရိတ် ပြင်ဆင်ရန်"] : type === "order" ? ["Edit order", "အော်ဒါ ပြင်ဆင်ရန်"] : type === "timberDeal" ? ["Edit timber deal", "သစ်ရောင်းဝယ်မှတ်တမ်း ပြင်ဆင်ရန်"] : ["Edit transportation", "သယ်ယူပို့ဆောင်ရေးမှတ်တမ်း ပြင်ဆင်ရန်"]
    : type === "expense" ? ["New expense", "အသုံးစရိတ်အသစ် ထည့်ရန်"] : type === "order" ? ["New order", "အော်ဒါအသစ် လက်ခံရန်"] : type === "timberDeal" ? ["New timber deal note", "သစ်ရောင်းဝယ်မှတ်တမ်း ထည့်ရန်"] : ["New transportation", "သယ်ယူပို့ဆောင်ရေးမှတ်တမ်း ထည့်ရန်"];
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && close()}><form className="modal" onSubmit={submit}><div className="modal-head"><div><p>{title[0]}</p><h2>{title[1]}</h2></div><button type="button" onClick={close}>×</button></div>
    {type === "expense" ? <div className="form-grid">
      <label>ပမာဏ (ကျပ်)<input name="amount" type="number" min="1" required defaultValue={initial.amount ?? ""} placeholder="ဥပမာ 50000" /></label>
      <label>ရက်စွဲ<input name="date" type="date" required defaultValue={initial.date || today()} /></label>
      <label>ငွေပေးချေမှု<select name="paymentMethod" defaultValue={initial.paymentMethod || "ငွေသား"}><option>ငွေသား</option><option>KPay</option><option>WavePay</option><option>ဘဏ်လွှဲ</option></select></label>
      <label>ငွေအရင်းအမြစ်<select name="paidBy" defaultValue={initial.paidBy || "မတည်ငွေ"}><option value="မတည်ငွေ">မတည်ငွေ (Capital Fund)</option><option value="အိုက်ပီ">အိုက်ပီ — ယခင်စာရင်းအတွက်</option><option value="အိုက် နောင့်">အိုက် နောင့် — ယခင်စာရင်းအတွက်</option></select></label>
      <label className="full fund-note">ယခုနောက်ပိုင်း အသုံးစရိတ်များအတွက် “မတည်ငွေ” ကို အသုံးပြုပါ။</label>
      <label className="full">အသုံးစရိတ်အမျိုးအစား<input name="category" required defaultValue={initial.category || ""} placeholder="ဥပမာ သယ်ယူပို့ဆောင်ခ" /></label>
      <label className="full">မှတ်ချက်<textarea name="note" defaultValue={initial.note || ""} placeholder="လိုအပ်လျှင် ရေးပါ" /></label>
    </div> : type === "order" ? <div className="form-grid">
      <label>ဖောက်သည်အမည်<input name="customer" required defaultValue={initial.customer || ""} /></label>
      <label>ကုမ္ပဏီ/လုပ်ငန်း<input name="company" defaultValue={initial.company || ""} /></label>
      <label>ရက်စွဲ<input name="date" type="date" required defaultValue={initial.date || today()} /></label>
      <label>သစ်အမျိုးအစား<input name="timberType" list="order-timber-types" defaultValue={initial.timberType || ""} placeholder="ရွေးပါ သို့မဟုတ် ရေးပါ" /><datalist id="order-timber-types">{timber.map(t => <option key={t.id} value={t.name} />)}</datalist></label>
      <label>အရေအတွက် (တန်)<input name="quantityTons" type="number" step="0.01" min="0.01" required defaultValue={initial.quantityTons ?? ""} /></label>
      {editing && <label>ရောင်းပြီးတန်<input name="soldTons" type="number" step="0.01" min="0" max={initial.quantityTons} defaultValue={initial.soldTons ?? 0} /></label>}
      <label>တစ်တန်ဈေး<input name="unitPrice" type="number" min="0" defaultValue={initial.unitPrice ?? 0} /></label>
      <label>လက်ခံပြီးငွေ<input name="paidAmount" type="number" min="0" defaultValue={initial.paidAmount ?? 0} /></label>
      <label>အခြေအနေ<select name="status" defaultValue={initial.status || "New"}><option>New</option><option>Processing</option><option>Partial</option><option>Sold</option><option>Paid</option></select></label>
    </div> : type === "timberDeal" ? <div className="form-grid">
      <label>သစ်ရောင်းသူ<input name="seller" required defaultValue={initial.seller || ""} placeholder="ဥပမာ လုင်းဟန်" /></label>
      <label>ဝယ်သူ<input name="buyer" required defaultValue={initial.buyer || ""} placeholder="ဥပမာ ပီလိူန် ညီကို" /></label>
      <label>ရက်စွဲ<input name="date" type="date" required defaultValue={initial.date || today()} /></label>
      <label>သစ်အမျိုးအစား<input name="timberType" list="timber-deal-types" required defaultValue={initial.timberType || ""} placeholder="ဥပမာ ယမနေ" /><datalist id="timber-deal-types">{timber.map(t => <option key={t.id} value={t.name} />)}</datalist></label>
      <label>အရေအတွက် / အသေးစိတ်<input name="timberDetails" required defaultValue={initial.timberDetails || ""} placeholder="ဥပမာ ၉ ပင်" /></label>
      <label className="full">ရောင်းဝယ်ပုံ / ဈေးသတ်မှတ်ပုံ<input name="dealDetails" defaultValue={initial.dealDetails || ""} placeholder="ဥပမာ အပင်ကြည့်ဈေးဖြင့် ဖြတ်ရောင်းဝယ်" /></label>
      <label>တန်ဖိုးကြိုစရံ (ကျပ်)<input name="advanceDeposit" type="number" min="0" defaultValue={initial.advanceDeposit ?? 0} placeholder="ဥပမာ 300000" /></label>
      <label>သစ်လိုက်ပြခ / မုန့်ဖိုး (ကျပ်)<input name="guideFee" type="number" min="0" defaultValue={initial.guideFee ?? 0} placeholder="ဥပမာ 10000" /></label>
      <label className="full">သစ်လိုက်ပြသူ မှတ်ချက်<input name="guideNote" defaultValue={initial.guideNote || ""} placeholder="အမည် သို့မဟုတ် မုန့်ဖိုးအကြောင်း" /></label>
      <label className="full fund-note">ဤစရံနှင့် လိုက်ပြခများကို ငွေစာရင်း၊ အသုံးစရိတ်နှင့် အမြတ်တွက်ချက်မှုတွင် ထည့်မတွက်ပါ။</label>
      <label className="full">အခြားမှတ်ချက်<textarea name="note" defaultValue={initial.note || ""} placeholder="လိုအပ်လျှင် ရေးပါ" /></label>
    </div> : <div className="form-grid">
      <label className="full">ချိတ်ဆက်မည့် ရောင်းပြီးအော်ဒါ<select name="orderId" required value={transportOrderId} onChange={e => { setTransportOrderId(e.target.value); setTransportTons(String(orders.find(order => String(order.id) === e.target.value)?.soldTons || "")); setFromLocation(""); setToLocation(""); }}><option value="">ရောင်းပြီးအော်ဒါရွေးချယ်ရန်</option>{orders.filter(order => Number(order.soldTons || 0) > 0 || order.id === initial.orderId).map(order => <option key={order.id} value={order.id}>#{order.id} — {order.customer} • {order.timberType || "သစ်အမျိုးအစားမရှိ"} • ရောင်းပြီး {number(Number(order.soldTons || 0))} တန်</option>)}</select></label>
      <div className="full fund-note">ရောင်းပြီး 15 တန် → တောမှ ရွာ 15 တန် → ရွာမှ ပန်းတိုင် 15 တန်။ အရောင်း 15 တန်အတိုင်းရှိပြီး လမ်းပိုင်းနှစ်ခု၏ ကုန်ကျငွေကို ပေါင်းတွက်ပါမည်။</div>
      {!editing && previousLegs.length > 0 && <label className="full">ယခင်လမ်းပိုင်းမှ ဆက်ပို့ရန်<select key={transportOrderId} defaultValue="" onChange={e => { const leg = previousLegs.find(route => String(route.id) === e.target.value); if (leg) { setFromLocation(leg.toLocation); setToLocation(""); setTransportTons(String(leg.tons)); } }}><option value="">လမ်းပိုင်းရွေးပါ (မဖြစ်မနေ မဟုတ်ပါ)</option>{previousLegs.map(leg => <option key={leg.id} value={leg.id}>{leg.fromLocation} → {leg.toLocation} • {number(leg.tons)} တန်</option>)}</select></label>}
      <label>စတင်သည့်နေရာ<input name="fromLocation" required value={fromLocation} onChange={e => setFromLocation(e.target.value)} placeholder="တော / ရွာ" /></label>
      <label>ပို့ဆောင်မည့်နေရာ<input name="toLocation" required value={toLocation} onChange={e => setToLocation(e.target.value)} placeholder="ရွာ / ပန်းတိုင်" /></label>
      <label>ရက်စွဲ<input name="date" type="date" required defaultValue={initial.date || today()} /></label>
      <label>သယ်ယူမည့်တန်ချိန်<input name="tons" type="number" step="0.001" min="0.001" max={selectedOrder ? Number(selectedOrder.soldTons) : undefined} required value={transportTons} onChange={e => setTransportTons(e.target.value)} placeholder="ဥပမာ 15" /></label>
      <label className="full">တစ်ခေါက် စုစုပေါင်းဈေး (ကျပ်)<input name="totalPrice" type="number" min="0" required defaultValue={initial.totalPrice ?? ""} placeholder="ဥပမာ 300000" /></label>
      <label className="full">မှတ်ချက်<textarea name="note" defaultValue={initial.note || ""} placeholder="ကားနံပါတ်၊ ယာဉ်မောင်းအမည် စသည်" /></label>
    </div>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={close}>မလုပ်တော့ပါ</button><button className="primary" disabled={saving}>{saving ? "သိမ်းနေသည်…" : editing ? "ပြင်ဆင်မှု သိမ်းမည်" : "စာရင်းသိမ်းမည်"}</button></div></form></div>;
}
