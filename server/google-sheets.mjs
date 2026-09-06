import crypto from "node:crypto";
import { validateTransportationChange } from "./transportation-totals.mjs";

const DEAL_MARKER = "__TIMBER_DEAL__";
const TRANSPORT_MARKER = "__TRANSPORTATION__";
const BUSINESS_DEALS_TITLE = "သစ်ရောင်းဝယ်";
const BUSINESS_DEAL_HEADERS = ["ID", "ရက်စွဲ", "သစ်အမျိုးအစား", "သစ်ရောင်းသူ", "ဝယ်သူ", "အရေအတွက် / အသေးစိတ်", "ရောင်းဝယ်ပုံ", "တန်ဖိုးကြိုစရံ", "သစ်လိုက်ပြခ", "လိုက်ပြသူ မှတ်ချက်", "အခြားမှတ်ချက်", "ဖျက်ရန်"];
const BUSINESS_TRANSPORT_TITLE = "သယ်ယူပို့ဆောင်ရေး";
const BUSINESS_TRANSPORT_HEADERS = ["ID", "ရက်စွဲ", "စတင်သည့်နေရာ", "ပို့ဆောင်မည့်နေရာ", "တန်ချိန်", "တစ်ခေါက်စုစုပေါင်းဈေး", "မှတ်ချက်", "ဖျက်ရန်", "Order ID", "အော်ဒါဖောက်သည်"];
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const tabs = [
  {
    title: "Expenses",
    headers: ["ID", "Date", "Amount", "Payment Method", "Paid By", "Category", "Note", "Delete"],
    table: "expenses",
    toRow: r => [r.id, r.date, r.amount, r.payment_method, r.paid_by, r.category, r.note, false],
    toRecord: row => ({
      id: id(row[0]), date: date(row[1], "Expenses / Date"), amount: positive(row[2], "Expenses / Amount"),
      payment_method: text(row[3]) || "ငွေသား", paid_by: oneOf(row[4], ["မတည်ငွေ", "အိုက်ပီ", "အိုက် နောင့်"], "Expenses / Paid By"),
      category: required(row[5], "Expenses / Category"), note: text(row[6]),
    }),
  },
  {
    title: "Orders",
    headers: ["ID", "Date", "Customer", "Company", "Timber Type", "Quantity Tons", "Sold Tons", "Unit Price", "Paid Amount", "Status", "Delete"],
    table: "orders",
    toRow: r => [r.id, r.date, r.customer, r.company, r.timber_type, r.quantity_tons, r.sold_tons, r.unit_price, r.paid_amount, r.status, false],
    toRecord: row => {
      const quantity = positive(row[5], "Orders / Quantity Tons");
      const sold = nonNegative(row[6], "Orders / Sold Tons");
      if (sold > quantity) throw new Error("Orders / Sold Tons cannot be greater than Quantity Tons");
      return {
        id: id(row[0]), date: date(row[1], "Orders / Date"), customer: required(row[2], "Orders / Customer"), company: text(row[3]),
        timber_type: text(row[4]), quantity_tons: quantity, sold_tons: sold, unit_price: nonNegative(row[7], "Orders / Unit Price"),
        paid_amount: nonNegative(row[8], "Orders / Paid Amount"), status: text(row[9]) || (sold === quantity ? "Sold" : sold > 0 ? "Partial" : "New"),
      };
    },
  },
  {
    title: "Inventory",
    headers: ["ID", "Name", "Whole Price", "Sawn Price", "Stock Tons", "Delete"],
    table: "timber",
    toRow: r => [r.id, r.name, r.whole_price, r.sawn_price, r.stock_tons, false],
    toRecord: row => ({
      id: id(row[0]), name: required(row[1], "Inventory / Name"), whole_price: nonNegative(row[2], "Inventory / Whole Price"),
      sawn_price: nonNegative(row[3], "Inventory / Sawn Price"), stock_tons: nonNegative(row[4], "Inventory / Stock Tons"),
    }),
  },
  {
    title: "Timber Deals",
    headers: ["ID", "Date", "Timber Type", "Seller", "Buyer", "Timber Details", "Deal Details", "Advance Deposit", "Guide Fee", "Guide Note", "Note", "Delete"],
    table: "taxes",
    marker: DEAL_MARKER,
    toRow: r => {
      const d = JSON.parse(r.note);
      const timber = normalizedTimberDetails(d);
      return [r.id, r.date, timber.timberType, d.seller, d.buyer, timber.timberDetails, d.dealDetails, d.advanceDeposit, d.guideFee, d.guideNote, d.note, false];
    },
    toRecord: row => {
      const details = {
        timberType: required(row[2], "Timber Deals / Timber Type"), seller: required(row[3], "Timber Deals / Seller"), buyer: required(row[4], "Timber Deals / Buyer"),
        timberDetails: required(row[5], "Timber Deals / Timber Details"), dealDetails: text(row[6]),
        advanceDeposit: nonNegative(row[7], "Timber Deals / Advance Deposit"), guideFee: nonNegative(row[8], "Timber Deals / Guide Fee"),
        guideNote: text(row[9]), note: text(row[10]),
      };
      return { id: id(row[0]), date: date(row[1], "Timber Deals / Date"), description: DEAL_MARKER, amount: 0, note: JSON.stringify(details) };
    },
  },
  {
    title: "Transportation",
    headers: ["ID", "Date", "From", "To", "Tons", "Total Price", "Note", "Order ID", "Order Customer", "Delete"],
    table: "taxes",
    marker: TRANSPORT_MARKER,
    toRow: r => { const d=JSON.parse(r.note); return [r.id, r.date, d.fromLocation, d.toLocation, d.tons, d.totalPrice, d.note, d.orderId||"", d.orderCustomer||"", false]; },
    toRecord: row => {
      const details={ fromLocation:required(row[2], "Transportation / From"), toLocation:required(row[3], "Transportation / To"), tons:positive(row[4], "Transportation / Tons"), totalPrice:nonNegative(row[5], "Transportation / Total Price"), note:text(row[6]), orderId:id(row[7])||null, orderCustomer:text(row[8]) };
      return { id:id(row[0]), date:date(row[1], "Transportation / Date"), description:TRANSPORT_MARKER, amount:0, note:JSON.stringify(details) };
    },
  },
];

function configured() {
  return Boolean(process.env.GOOGLE_SHEETS_SPREADSHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

function text(value) { return String(value ?? "").trim(); }
function required(value, label) { const result = text(value); if (!result) throw new Error(`${label} is required`); return result; }
function id(value) { const result = text(value); if (!result) return undefined; const n = Number(result); if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`Invalid ID: ${result}`); return n; }
function numeric(value, label) { const raw = text(value).replaceAll(",", ""); const n = raw === "" ? 0 : Number(raw); if (!Number.isFinite(n)) throw new Error(`${label} must be a number`); return n; }
function positive(value, label) { const n = numeric(value, label); if (!(n > 0)) throw new Error(`${label} must be greater than zero`); return n; }
function nonNegative(value, label) { const n = numeric(value, label); if (n < 0) throw new Error(`${label} cannot be negative`); return n; }
function oneOf(value, choices, label) { const result = required(value, label); if (!choices.includes(result)) throw new Error(`${label} must be one of: ${choices.join(", ")}`); return result; }
function date(value, label) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const result = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    if (!Number.isNaN(result.getTime())) return result.toISOString().slice(0, 10);
  }
  const result = required(value, label);
  if (/^\d{4}-\d{2}-\d{2}$/.test(result)) return result;
  const match = result.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  throw new Error(`${label} must use YYYY-MM-DD`);
}
function truthy(value) { return ["true", "yes", "1", "delete", "deleted"].includes(text(value).toLowerCase()); }
function normalizedTimberDetails(details) {
  const combined = text(details.timberDetails);
  if (text(details.timberType)) return { timberType:text(details.timberType), timberDetails:combined };
  const match = combined.match(/^(\S+)\s+(.+)$/);
  return match ? { timberType:match[1], timberDetails:match[2] } : { timberType:combined, timberDetails:combined };
}
function base64url(value) { return Buffer.from(value).toString("base64url"); }
function columnName(length) { let result = ""; for (let n = length; n; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + ((n - 1) % 26)) + result; return result; }
function range(tab, cells) { return `'${tab.replaceAll("'", "''")}'!${cells}`; }

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({ iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, scope: SHEETS_SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const unsigned = `${header}.${claim}`;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replaceAll("\\n", "\n");
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), key).toString("base64url");
  const response = await fetch(TOKEN_URL, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error(`Google authentication failed: ${result.error_description || result.error || response.status}`);
  return result.access_token;
}

async function google(path, token, init = {}) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEETS_SPREADSHEET_ID}${path}`, {
    ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Google Sheets error: ${result.error?.message || response.status}`);
  return result;
}

async function spreadsheetMetadata(token) {
  return google("?fields=properties,sheets.properties", token);
}

async function ensureBusinessSupplementalTabs(token, metadata) {
  const specs = [
    { title:BUSINESS_DEALS_TITLE, headers:BUSINESS_DEAL_HEADERS, deleteIndex:11 },
    { title:BUSINESS_TRANSPORT_TITLE, headers:BUSINESS_TRANSPORT_HEADERS, deleteIndex:7 },
  ];
  const existing = new Set((metadata.sheets || []).map(sheet => sheet.properties.title));
  const created = specs.filter(spec => !existing.has(spec.title));
  if (created.length) await google(":batchUpdate", token, { method:"POST", body:JSON.stringify({ requests:created.map(spec => ({ addSheet:{ properties:{ title:spec.title, gridProperties:{ frozenRowCount:2 } } } })) }) });
  const finalMetadata = created.length ? await spreadsheetMetadata(token) : metadata;
  const ids = Object.fromEntries(finalMetadata.sheets.map(sheet => [sheet.properties.title, sheet.properties.sheetId]));
  const values = [
    ...created.map(spec => ({ range:range(spec.title, "A1"), majorDimension:"ROWS", values:[[spec.title]] })),
    ...specs.map(spec => ({ range:range(spec.title, `A2:${columnName(spec.headers.length)}2`), majorDimension:"ROWS", values:[spec.headers] })),
  ];
  await google("/values:batchUpdate", token, { method:"POST", body:JSON.stringify({ valueInputOption:"RAW", data:values }) });
  const requests = created.flatMap(spec => {
    const sheetId=ids[spec.title], endColumnIndex=spec.headers.length;
    return [
      { mergeCells:{ range:{ sheetId, startRowIndex:0, endRowIndex:1, startColumnIndex:0, endColumnIndex }, mergeType:"MERGE_ALL" } },
      { repeatCell:{ range:{ sheetId, startRowIndex:0, endRowIndex:1, startColumnIndex:0, endColumnIndex }, cell:{ userEnteredFormat:{ backgroundColorStyle:{ rgbColor:{ red:0.26, green:0.51, blue:0.88 } }, horizontalAlignment:"CENTER", verticalAlignment:"MIDDLE", textFormat:{ bold:true, fontSize:16 } } }, fields:"userEnteredFormat" } },
      { repeatCell:{ range:{ sheetId, startRowIndex:1, endRowIndex:2, startColumnIndex:0, endColumnIndex }, cell:{ userEnteredFormat:{ backgroundColorStyle:{ rgbColor:{ red:0.92, green:0.94, blue:0.97 } }, verticalAlignment:"MIDDLE", wrapStrategy:"WRAP", textFormat:{ bold:true } } }, fields:"userEnteredFormat" } },
      { updateSheetProperties:{ properties:{ sheetId, gridProperties:{ frozenRowCount:2 } }, fields:"gridProperties.frozenRowCount" } },
      { setDataValidation:{ range:{ sheetId, startRowIndex:2, endRowIndex:2000, startColumnIndex:spec.deleteIndex, endColumnIndex:spec.deleteIndex+1 }, rule:{ condition:{ type:"BOOLEAN" }, strict:true, showCustomUi:true } } },
      { autoResizeDimensions:{ dimensions:{ sheetId, dimension:"COLUMNS", startIndex:0, endIndex:endColumnIndex } } },
    ];
  });
  if(!created.some(spec=>spec.title===BUSINESS_TRANSPORT_TITLE)) {
    const sheetId=ids[BUSINESS_TRANSPORT_TITLE];
    requests.push(
      { repeatCell:{ range:{ sheetId, startRowIndex:1, endRowIndex:2, startColumnIndex:8, endColumnIndex:10 }, cell:{ userEnteredFormat:{ backgroundColorStyle:{ rgbColor:{ red:0.92, green:0.94, blue:0.97 } }, verticalAlignment:"MIDDLE", wrapStrategy:"WRAP", textFormat:{ bold:true } } }, fields:"userEnteredFormat" } },
      { autoResizeDimensions:{ dimensions:{ sheetId, dimension:"COLUMNS", startIndex:8, endIndex:10 } } },
    );
  }
  if(requests.length) await google(":batchUpdate", token, { method:"POST", body:JSON.stringify({ requests }) });
  return finalMetadata;
}

async function ensureTabs(token, suppliedMetadata) {
  const metadata = suppliedMetadata || await spreadsheetMetadata(token);
  const existing = new Set((metadata.sheets || []).map(sheet => sheet.properties.title));
  const created = tabs.filter(tab => !existing.has(tab.title)).map(tab => tab.title);
  const requests = created.map(title => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } }));
  if (requests.length) await google(":batchUpdate", token, { method: "POST", body: JSON.stringify({ requests }) });
  const finalMetadata = requests.length ? await google("?fields=sheets.properties", token) : metadata;
  return {
    created,
    ids: Object.fromEntries((finalMetadata.sheets || []).map(sheet => [sheet.properties.title, sheet.properties.sheetId])),
  };
}

function businessDate(value, label) {
  const raw = text(value);
  if (!raw || raw === "-") throw new Error(`${label} needs a real date`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const numericDate = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (numericDate) return `${numericDate[3]}-${numericDate[2].padStart(2, "0")}-${numericDate[1].padStart(2, "0")}`;
  const namedDate = raw.match(/^(\d{1,2})\.([A-Za-z]{3})\.(\d{4})$/);
  if (namedDate) {
    const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(namedDate[2].toLowerCase()) + 1;
    if (month) return `${namedDate[3]}-${String(month).padStart(2, "0")}-${namedDate[1].padStart(2, "0")}`;
  }
  return date(value, label);
}

function optionalBusinessDate(value, label) {
  const raw = text(value);
  return !raw || raw === "-" ? null : businessDate(value, label);
}

function sheetDate(value) {
  if (!value) return "";
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  const name = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1];
  return `${day}.${name}.${year}`;
}

function normalizePaidBy(value) {
  const raw = text(value).replace(/[\u200B-\u200D\uFEFF]/g, "");
  if (raw.includes("နောင့်")) return "အိုက် နောင့်";
  if (raw.includes("ပီ")) return "အိုက်ပီ";
  if (raw.includes("မတည်")) return "မတည်ငွေ";
  return "မတည်ငွေ";
}

function normalizePayment(value) {
  const raw = text(value);
  if (/k\s*pay/i.test(raw)) return "KPay";
  if (/wave/i.test(raw)) return "WavePay";
  return raw || "ငွေသား";
}

function splitBusinessExpenseDescription(value) {
  const parts = text(value).split(/\s+—\s+/).map(part => part.trim()).filter(Boolean);
  const category = parts[0] && parts[0] !== "-" ? parts[0] : "အမျိုးအစားမသတ်မှတ်ရ";
  const notes = [];
  for (const part of parts.slice(1)) {
    if (part !== category && part !== notes.at(-1)) notes.push(part);
  }
  return { category, note:notes.join(" — ") };
}

function businessLayout(metadata) {
  const titles = new Set((metadata.sheets || []).map(sheet => sheet.properties.title));
  return ["Capital", "Credits", "စျေး", "Orders", "Sold Orders", "အခွန်"].every(title => titles.has(title));
}

async function readBusinessWorkbook(token, metadata) {
  const properties = Object.fromEntries(metadata.sheets.map(sheet => [sheet.properties.title, sheet.properties]));
  const specs = [["Capital", "A1:D20"], ["Credits", `A1:J${properties.Credits.gridProperties.rowCount}`], ["စျေး", `A1:E${properties["စျေး"].gridProperties.rowCount}`], ["Orders", `A1:J${properties.Orders.gridProperties.rowCount}`], ["အခွန်", `A1:E${properties["အခွန်"].gridProperties.rowCount}`]];
  if (properties[BUSINESS_DEALS_TITLE]) specs.push([BUSINESS_DEALS_TITLE, `A1:L${properties[BUSINESS_DEALS_TITLE].gridProperties.rowCount}`]);
  if (properties[BUSINESS_TRANSPORT_TITLE]) specs.push([BUSINESS_TRANSPORT_TITLE, `A1:J${properties[BUSINESS_TRANSPORT_TITLE].gridProperties.rowCount}`]);
  const params = new URLSearchParams({ majorDimension: "ROWS", valueRenderOption: "FORMULA", dateTimeRenderOption: "FORMATTED_STRING" });
  for (const [title, cells] of specs) params.append("ranges", range(title, cells));
  const result = await google(`/values:batchGet?${params}`, token);
  return { properties, values: Object.fromEntries(specs.map(([title], index) => [title, result.valueRanges?.[index]?.values || []])) };
}

function findTotalRow(rows, labels) {
  const index = rows.findIndex(row => row.some(cell => labels.some(label => text(cell).includes(label))));
  return index >= 0 ? index + 1 : rows.length + 1;
}

function parseBusinessRows(book) {
  const errors = [], blockedTabs = new Set(), protectedRows = { Credits: new Set(), Orders: new Set(), စျေး: new Set(), [BUSINESS_DEALS_TITLE]: new Set(), [BUSINESS_TRANSPORT_TITLE]:new Set() }, protectedIds = { Credits: new Set(), Orders: new Set(), စျေး: new Set(), [BUSINESS_DEALS_TITLE]: new Set(), [BUSINESS_TRANSPORT_TITLE]:new Set() };
  const creditsTotal = findTotalRow(book.values.Credits, ["Total"]);
  const ordersTotal = findTotalRow(book.values.Orders, ["Total ( တန် )​", "Total ( တန် )", "Total"]);
  const credits = [], orders = [], timber = [], taxes = [], timberDeals = [], transportation = [];
  for (let rowNumber = 3; rowNumber < creditsTotal; rowNumber += 1) {
    const row = book.values.Credits[rowNumber - 1] || [];
    if (!row.some(cell => text(cell)) || !(numeric(row[1], "Amount") > 0)) continue;
    try {
      const description = splitBusinessExpenseDescription(row[6]);
      credits.push({ rowNumber, record: { id:id(row[0]), amount:positive(row[1], "Amount"), date:optionalBusinessDate(row[2], "Date"), payment_method:normalizePayment(row[3]), paid_by:normalizePaidBy(row[5]), category:description.category, note:description.note } });
    } catch (error) { errors.push(`Credits!A${rowNumber}:G${rowNumber} — ${error.message}`); blockedTabs.add("Credits"); protectedRows.Credits.add(rowNumber); try { const recordId=id(row[0]); if(recordId) protectedIds.Credits.add(recordId); } catch {} }
  }
  for (let rowNumber = 3; rowNumber < ordersTotal; rowNumber += 1) {
    const row = book.values.Orders[rowNumber - 1] || [];
    if (!row.some(cell => text(cell)) || !(numeric(row[4], "Order Amount") > 0)) continue;
    try {
      const record = { id:id(row[0]), customer:required(row[1], "Name"), company:text(row[2]), date:businessDate(row[3], "Date"), quantity_tons:positive(row[4], "Order Amount"), paid_amount:nonNegative(row[5], "Received amount") };
      if (text(row[6])) record.timber_type = text(row[6]);
      if (text(row[7])) record.sold_tons = nonNegative(row[7], "Sold Tons");
      if (text(row[8])) record.unit_price = nonNegative(row[8], "Unit Price");
      if (text(row[9])) record.status = text(row[9]);
      if (record.sold_tons !== undefined && record.sold_tons > record.quantity_tons) throw new Error("Sold Tons cannot exceed Order Amount");
      orders.push({ rowNumber, record });
    } catch (error) { errors.push(`Orders!A${rowNumber}:J${rowNumber} — ${error.message}`); blockedTabs.add("Orders"); protectedRows.Orders.add(rowNumber); try { const recordId=id(row[0]); if(recordId) protectedIds.Orders.add(recordId); } catch {} }
  }
  for (let rowNumber = 4; rowNumber <= book.values["စျေး"].length; rowNumber += 1) {
    const row = book.values["စျေး"][rowNumber - 1] || [];
    if (!text(row[1])) continue;
    try { timber.push({ rowNumber, record:{ id:id(row[0]), name:required(row[1], "Name"), whole_price:nonNegative(row[2], "Whole Price"), sawn_price:nonNegative(row[3], "Sawn Price"), stock_tons:nonNegative(row[4], "Stock Tons") } }); }
    catch (error) { errors.push(`စျေး!A${rowNumber}:E${rowNumber} — ${error.message}`); blockedTabs.add("စျေး"); protectedRows["စျေး"].add(rowNumber); try { const recordId=id(row[0]); if(recordId) protectedIds["စျေး"].add(recordId); } catch {} }
  }
  const taxTotal = findTotalRow(book.values["အခွန်"], ["စုစုပေါင်း", "Total"]);
  for (let rowNumber = 2; rowNumber < taxTotal; rowNumber += 1) {
    const row = book.values["အခွန်"][rowNumber - 1] || [];
    if (!text(row[2]) || !(numeric(row[3], "Tax amount") > 0)) continue;
    try { taxes.push({ rowNumber, record:{ id:id(row[0]), date:businessDate(row[1], "Date"), description:text(row[2]), amount:positive(row[3], "Amount"), note:text(row[4]) } }); }
    catch (error) { errors.push(`အခွန်!A${rowNumber}:E${rowNumber} — ${error.message}`); blockedTabs.add("အခွန်"); }
  }
  const dealRows = book.values[BUSINESS_DEALS_TITLE] || [];
  if (dealRows.length) {
    const receivedHeaders = dealRows[1] || [];
    const mismatch = BUSINESS_DEAL_HEADERS.some((header, index) => text(receivedHeaders[index]) !== header);
    if (mismatch) {
      errors.push(`${BUSINESS_DEALS_TITLE}!A2:L2 — ခေါင်းစဉ်များကို မပြောင်းပါနှင့်။`);
      blockedTabs.add(BUSINESS_DEALS_TITLE);
    } else {
      for (let rowNumber = 3; rowNumber <= dealRows.length; rowNumber += 1) {
        const row = dealRows[rowNumber - 1] || [];
        if (!row.slice(0, 11).some(cell => text(cell)) && !truthy(row[11])) continue;
        try {
          const recordId = id(row[0]);
          if (truthy(row[11])) {
            if (recordId) timberDeals.push({ rowNumber, deleteId:recordId });
            continue;
          }
          const timber = normalizedTimberDetails({ timberType:row[2], timberDetails:required(row[5], "Timber Details") });
          const details = {
            timberType:required(timber.timberType, "Timber Type"), seller:required(row[3], "Seller"), buyer:required(row[4], "Buyer"),
            timberDetails:required(timber.timberDetails, "Timber Details"), dealDetails:text(row[6]), advanceDeposit:nonNegative(row[7], "Advance Deposit"),
            guideFee:nonNegative(row[8], "Guide Fee"), guideNote:text(row[9]), note:text(row[10]),
          };
          timberDeals.push({ rowNumber, record:{ id:recordId, date:businessDate(row[1], "Date"), description:DEAL_MARKER, amount:0, note:JSON.stringify(details) } });
        } catch (error) {
          errors.push(`${BUSINESS_DEALS_TITLE}!A${rowNumber}:L${rowNumber} — ${error.message}`);
          blockedTabs.add(BUSINESS_DEALS_TITLE); protectedRows[BUSINESS_DEALS_TITLE].add(rowNumber);
          try { const recordId=id(row[0]); if(recordId) protectedIds[BUSINESS_DEALS_TITLE].add(recordId); } catch {}
        }
      }
    }
  }
  const transportRows=book.values[BUSINESS_TRANSPORT_TITLE]||[];
  if (transportRows.length) {
    const receivedHeaders=transportRows[1]||[];
    const mismatch=BUSINESS_TRANSPORT_HEADERS.some((header,index)=>text(receivedHeaders[index])!==header);
    if (mismatch) {
      errors.push(`${BUSINESS_TRANSPORT_TITLE}!A2:J2 — ခေါင်းစဉ်များကို မပြောင်းပါနှင့်။`); blockedTabs.add(BUSINESS_TRANSPORT_TITLE);
    } else {
      for (let rowNumber=3; rowNumber<=transportRows.length; rowNumber+=1) {
        const row=transportRows[rowNumber-1]||[];
        if (!row.slice(0,7).some(cell=>text(cell))&&!truthy(row[7])) continue;
        try {
          const recordId=id(row[0]);
          if (truthy(row[7])) { if(recordId) transportation.push({rowNumber,deleteId:recordId}); continue; }
          const orderId=id(row[8])||null;
          const details={ fromLocation:required(row[2],"From"), toLocation:required(row[3],"To"), tons:positive(row[4],"Tons"), totalPrice:nonNegative(row[5],"Total Price"), note:text(row[6]), orderId, orderCustomer:text(row[9]) };
          transportation.push({rowNumber,record:{id:recordId,date:businessDate(row[1],"Date"),description:TRANSPORT_MARKER,amount:0,note:JSON.stringify(details)}});
        } catch(error) {
          errors.push(`${BUSINESS_TRANSPORT_TITLE}!A${rowNumber}:J${rowNumber} — ${error.message}`); blockedTabs.add(BUSINESS_TRANSPORT_TITLE); protectedRows[BUSINESS_TRANSPORT_TITLE].add(rowNumber);
          try { const recordId=id(row[0]); if(recordId) protectedIds[BUSINESS_TRANSPORT_TITLE].add(recordId); } catch {}
        }
      }
    }
  }
  const capital = numeric(book.values.Capital?.[2]?.[1], "Capital") + numeric(book.values.Capital?.[2]?.[2], "Capital");
  return { credits, orders, timber, taxes, timberDeals, transportation, creditsTotal, ordersTotal, errors, blockedTabs, protectedRows, protectedIds, capital };
}

async function importBusinessRows(supabase, state) {
  for (const [title, table, entries] of [["Credits", "expenses", state.credits], ["Orders", "orders", state.orders], ["စျေး", "timber", state.timber], ["အခွန်", "taxes", state.taxes]]) {
    if (state.blockedTabs.has(title)) continue;
    // Older business workbooks do not have every newer Orders column. Preserve
    // the database value for a blank optional field instead of upserting NULL.
    const { data:known, error:readError } = await supabase.from(table).select(table === "orders" ? "*" : "id"); if (readError) throw readError;
    const knownIds = new Set(known.map(row => Number(row.id)));
    const knownById = new Map(known.map(row => [Number(row.id), row]));
    const existing = entries.filter(entry => entry.record.id && knownIds.has(Number(entry.record.id))).map(entry => {
      if (table !== "orders") return entry.record;
      const previous = knownById.get(Number(entry.record.id));
      return {
        ...previous,
        ...entry.record,
        timber_type: entry.record.timber_type ?? previous.timber_type,
        sold_tons: entry.record.sold_tons ?? previous.sold_tons,
        unit_price: entry.record.unit_price ?? previous.unit_price,
        status: entry.record.status ?? previous.status,
      };
    });
    const additions = entries.filter(entry => !entry.record.id || !knownIds.has(Number(entry.record.id)));
    if (existing.length) { const { error } = await supabase.from(table).upsert(existing, { onConflict:"id" }); if (error) throw error; }
    if (additions.length) {
      const records = additions.map(entry => { const record={...entry.record}; delete record.id; return record; });
      const { data, error } = await supabase.from(table).insert(records).select("id"); if (error) throw error;
      additions.forEach((entry, index) => { entry.record.id = data[index].id; });
    }
  }
  if (!state.blockedTabs.has(BUSINESS_DEALS_TITLE)) {
    const deletions = state.timberDeals.filter(entry => entry.deleteId).map(entry => entry.deleteId);
    if (deletions.length) {
      const { error } = await supabase.from("taxes").delete().eq("description", DEAL_MARKER).in("id", deletions); if (error) throw error;
    }
    const entries = state.timberDeals.filter(entry => entry.record);
    const { data:known, error:readError } = await supabase.from("taxes").select("id").eq("description", DEAL_MARKER); if (readError) throw readError;
    const knownIds = new Set(known.map(row => Number(row.id)));
    const existing = entries.filter(entry => entry.record.id && knownIds.has(Number(entry.record.id))).map(entry => entry.record);
    const additions = entries.filter(entry => !entry.record.id || !knownIds.has(Number(entry.record.id)));
    if (existing.length) { const { error } = await supabase.from("taxes").upsert(existing, { onConflict:"id" }); if (error) throw error; }
    if (additions.length) {
      const records = additions.map(entry => { const record={...entry.record}; delete record.id; return record; });
      const { data, error } = await supabase.from("taxes").insert(records).select("id"); if (error) throw error;
      additions.forEach((entry, index) => { entry.record.id = data[index].id; });
    }
  }
  if (!state.blockedTabs.has(BUSINESS_TRANSPORT_TITLE)) {
    const deletions=state.transportation.filter(entry=>entry.deleteId).map(entry=>entry.deleteId);
    const entries=state.transportation.filter(entry=>entry.record);
    const {data:known,error:readError}=await supabase.from("taxes").select("id,note").eq("description",TRANSPORT_MARKER); if(readError) throw readError;
    const knownIds=new Set(known.map(row=>Number(row.id)));
    const existing=entries.filter(entry=>entry.record.id&&knownIds.has(Number(entry.record.id))).map(entry=>entry.record);
    const additions=entries.filter(entry=>!entry.record.id||!knownIds.has(Number(entry.record.id)));
    const deletionIds=new Set(deletions.map(Number)), replacements=new Map(existing.map(record=>[Number(record.id),record]));
    const nextRows=known.filter(row=>!deletionIds.has(Number(row.id))).map(row=>replacements.get(Number(row.id))||row).concat(additions.map(entry=>entry.record));
    await validateTransportationChange(supabase,known,nextRows);
    if (deletions.length) { const {error}=await supabase.from("taxes").delete().eq("description",TRANSPORT_MARKER).in("id",deletions); if(error) throw error; }
    if (existing.length) { const {error}=await supabase.from("taxes").upsert(existing,{onConflict:"id"}); if(error) throw error; }
    if (additions.length) {
      const records=additions.map(entry=>{const record={...entry.record};delete record.id;return record;});
      const {data,error}=await supabase.from("taxes").insert(records).select("id"); if(error) throw error;
      additions.forEach((entry,index)=>{entry.record.id=data[index].id;});
    }
  }
}

async function businessDatabaseRows(supabase) {
  const [expenses, orders, timber, timberDeals, transportation] = await Promise.all([
    supabase.from("expenses").select("*").order("id"), supabase.from("orders").select("*").order("id"), supabase.from("timber").select("*").order("id"),
    supabase.from("taxes").select("*").eq("description", DEAL_MARKER).order("id"),
    supabase.from("taxes").select("*").eq("description", TRANSPORT_MARKER).order("id"),
  ]);
  for (const result of [expenses, orders, timber, timberDeals, transportation]) if (result.error) throw result.error;
  return { expenses:expenses.data, orders:orders.data, timber:timber.data, timberDeals:timberDeals.data, transportation:transportation.data };
}

async function exportBusinessRows(supabase, token, book, state) {
  const dbRows = await businessDatabaseRows(supabase);
  const configs = [
    { title:"Credits", rows:dbRows.expenses, entries:state.credits, total:state.creditsTotal, blocks:r=>[[r.id, r.amount, sheetDate(r.date), r.payment_method], [r.paid_by, `${r.category}${r.note ? ` — ${r.note}` : ""}`]], ranges:n=>[`A${n}:D${n}`, `F${n}:G${n}`] },
    { title:"Orders", rows:dbRows.orders, entries:state.orders, total:state.ordersTotal, blocks:r=>[[r.id, r.customer, r.company, sheetDate(r.date), r.quantity_tons, r.paid_amount, r.timber_type, r.sold_tons, r.unit_price, r.status]], ranges:n=>[`A${n}:J${n}`] },
    { title:"စျေး", rows:dbRows.timber, entries:state.timber, total:book.values["စျေး"].length + 1, blocks:r=>[[r.id, r.name, r.whole_price, r.sawn_price, r.stock_tons]], ranges:n=>[`A${n}:E${n}`] },
  ];
  if (book.properties[BUSINESS_DEALS_TITLE]) configs.push({
    title:BUSINESS_DEALS_TITLE, rows:dbRows.timberDeals, entries:state.timberDeals.filter(entry => entry.record),
    total:book.properties[BUSINESS_DEALS_TITLE].gridProperties.rowCount + 1, start:3, noTotal:true,
    blocks:r=>{ const d=JSON.parse(r.note), timber=normalizedTimberDetails(d); return [[r.id, sheetDate(r.date), timber.timberType, d.seller, d.buyer, timber.timberDetails, d.dealDetails, d.advanceDeposit, d.guideFee, d.guideNote, d.note, false]]; },
    ranges:n=>[`A${n}:L${n}`],
  });
  if (book.properties[BUSINESS_TRANSPORT_TITLE]) configs.push({
    title:BUSINESS_TRANSPORT_TITLE, rows:dbRows.transportation, entries:state.transportation.filter(entry=>entry.record),
    total:book.properties[BUSINESS_TRANSPORT_TITLE].gridProperties.rowCount+1, start:3, noTotal:true,
    blocks:r=>{const d=JSON.parse(r.note);return [[r.id,sheetDate(r.date),d.fromLocation,d.toLocation,d.tons,d.totalPrice,d.note,false,d.orderId||"",d.orderCustomer||""]];},
    ranges:n=>[`A${n}:J${n}`],
  });
  const valueUpdates = [], clearRanges = [];
  for (const config of configs) {
    if (state.blockedTabs.has(config.title)) continue;
    const byId = new Map(config.entries.filter(entry => entry.record.id).map(entry => [Number(entry.record.id), entry]));
    const occupied = new Set([...config.entries.map(entry => entry.rowNumber), ...(state.protectedRows[config.title] || [])]);
    const available = [];
    const start = config.start || (config.title === "စျေး" ? 4 : 3);
    const reservedRow = config.noTotal || config.title === "စျေး" ? config.total : Math.max(start, config.total - 1);
    for (let row = start; row < reservedRow; row += 1) if (!occupied.has(row)) available.push(row);
    const missing = config.rows.filter(record => !byId.has(Number(record.id)) && !state.protectedIds[config.title]?.has(Number(record.id)));
    const insertCount = config.title === "စျေး" ? 0 : Math.max(0, missing.length - available.length);
    if (insertCount) {
      const insertAt = reservedRow - 1;
      await google(":batchUpdate", token, { method:"POST", body:JSON.stringify({ requests:[{ insertDimension:{ range:{ sheetId:book.properties[config.title].sheetId, dimension:"ROWS", startIndex:insertAt, endIndex:insertAt + insertCount }, inheritFromBefore:true } }] }) });
      for (let offset = 0; offset < insertCount; offset += 1) available.push(reservedRow + offset);
      config.total += insertCount;
    }
    for (const record of config.rows) {
      const existing = byId.get(Number(record.id));
      const rowNumber = existing?.rowNumber || available.shift() || config.total++;
      if (state.protectedRows[config.title]?.has(rowNumber)) continue;
      const ranges = config.ranges(rowNumber), blocks = config.blocks(record);
      ranges.forEach((cells, index) => valueUpdates.push({ range:range(config.title, cells), majorDimension:"ROWS", values:[blocks[index]] }));
    }
    const dbIds = new Set(config.rows.map(record => Number(record.id)));
    for (const entry of config.entries) if (entry.record.id && !dbIds.has(Number(entry.record.id)) && !state.protectedRows[config.title]?.has(entry.rowNumber)) clearRanges.push(...config.ranges(entry.rowNumber).map(cells => range(config.title, cells)));
  }
  valueUpdates.push({ range:range("Orders", "G2:J2"), majorDimension:"ROWS", values:[["Timber Type", "Sold Tons", "Unit Price", "Status"]] });
  if (clearRanges.length) await google("/values:batchClear", token, { method:"POST", body:JSON.stringify({ ranges:clearRanges }) });
  if (valueUpdates.length) await google("/values:batchUpdate", token, { method:"POST", body:JSON.stringify({ valueInputOption:"RAW", data:valueUpdates }) });
  const capitalBalanceFormula=`=B5-Credits!B${state.creditsTotal}-SUM('${BUSINESS_TRANSPORT_TITLE}'!F3:F)`;
  await google("/values:batchUpdate", token, { method:"POST", body:JSON.stringify({ valueInputOption:"USER_ENTERED", data:[{ range:range("Capital","B6"), majorDimension:"ROWS", values:[[capitalBalanceFormula]] }] }) });
  return { Credits:dbRows.expenses.length, Orders:dbRows.orders.length, စျေး:dbRows.timber.length, [BUSINESS_DEALS_TITLE]:dbRows.timberDeals.length, [BUSINESS_TRANSPORT_TITLE]:dbRows.transportation.length };
}

async function syncBusinessWorkbook(supabase, token, metadata, { importFirst }) {
  const book = await readBusinessWorkbook(token, metadata);
  const state = parseBusinessRows(book);
  if (importFirst) await importBusinessRows(supabase, state);
  const exported = await exportBusinessRows(supabase, token, book, state);
  return { configured:true, layout:"Business Expense In/Out", capital:state.capital, imported:importFirst ? { Credits:state.credits.length, Orders:state.orders.length, စျေး:state.timber.length, အခွန်:state.taxes.length, [BUSINESS_DEALS_TITLE]:state.timberDeals.filter(entry => entry.record).length, [BUSINESS_TRANSPORT_TITLE]:state.transportation.filter(entry=>entry.record).length } : undefined, exported, warnings:state.errors, spreadsheetId:process.env.GOOGLE_SHEETS_SPREADSHEET_ID };
}

async function readTabs(token) {
  const params = new URLSearchParams({ majorDimension: "ROWS", valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "FORMATTED_STRING" });
  for (const tab of tabs) params.append("ranges", range(tab.title, `A1:${columnName(tab.headers.length)}`));
  const result = await google(`/values:batchGet?${params}`, token);
  return result.valueRanges || [];
}

async function importRows(supabase, token) {
  const valueRanges = await readTabs(token);
  const counts = {};
  for (let index = 0; index < tabs.length; index += 1) {
    const tab = tabs[index];
    const allRows = valueRanges[index]?.values || [];
    const receivedHeaders = allRows[0] || [];
    if (receivedHeaders.some(cell => text(cell))) {
      const mismatch = tab.headers.some((header, headerIndex) => text(receivedHeaders[headerIndex]) !== header);
      if (mismatch) throw new Error(`${tab.title} row 1: headers must be exactly ${tab.headers.join(" | ")}`);
    }
    const rows = allRows.slice(1);
    const existing = [], additions = [], deletions = [];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      if (!row.some(cell => text(cell))) continue;
      try {
        const recordId = id(row[0]);
        if (truthy(row[tab.headers.length - 1])) {
          if (recordId) deletions.push(recordId);
          continue;
        }
        const record = tab.toRecord(row);
        (record.id ? existing : additions).push(record);
      } catch (error) {
        throw new Error(`${tab.title} row ${rowIndex + 2}: ${error instanceof Error ? error.message : error}`);
      }
    }
    if(tab.marker===TRANSPORT_MARKER) {
      const {data:known,error:knownError}=await supabase.from("taxes").select("id,note").eq("description",TRANSPORT_MARKER); if(knownError) throw knownError;
      const deletionIds=new Set(deletions.map(Number)), replacements=new Map(existing.map(record=>[Number(record.id),record]));
      const nextRows=known.filter(row=>!deletionIds.has(Number(row.id))).map(row=>replacements.get(Number(row.id))||row).concat(additions);
      await validateTransportationChange(supabase,known,nextRows);
    }
    if (deletions.length) {
      let query = supabase.from(tab.table).delete().in("id", deletions);
      if (tab.marker) query = query.eq("description", tab.marker);
      const { error } = await query; if (error) throw error;
    }
    if (existing.length) { const { error } = await supabase.from(tab.table).upsert(existing, { onConflict: "id" }); if (error) throw error; }
    if (additions.length) { const { error } = await supabase.from(tab.table).insert(additions); if (error) throw error; }
    counts[tab.title] = existing.length + additions.length;
  }
  return counts;
}

async function databaseRows(supabase) {
  const [expenses, orders, timber, deals, transportation] = await Promise.all([
    supabase.from("expenses").select("*").order("date", { ascending: false }).order("id", { ascending: false }),
    supabase.from("orders").select("*").order("date", { ascending: false }).order("id", { ascending: false }),
    supabase.from("timber").select("*").order("id"),
    supabase.from("taxes").select("*").eq("description", DEAL_MARKER).order("date", { ascending: false }).order("id", { ascending: false }),
    supabase.from("taxes").select("*").eq("description", TRANSPORT_MARKER).order("date", { ascending: false }).order("id", { ascending: false }),
  ]);
  for (const result of [expenses, orders, timber, deals, transportation]) if (result.error) throw result.error;
  return [expenses.data, orders.data, timber.data, deals.data, transportation.data];
}

async function exportRows(supabase, token) {
  const data = await databaseRows(supabase);
  const clearRanges = tabs.map(tab => range(tab.title, `A:${columnName(tab.headers.length)}`));
  await google("/values:batchClear", token, { method: "POST", body: JSON.stringify({ ranges: clearRanges }) });
  const updates = tabs.map((tab, index) => ({ range: range(tab.title, "A1"), majorDimension: "ROWS", values: [tab.headers, ...data[index].map(tab.toRow)] }));
  await google("/values:batchUpdate", token, { method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data: updates }) });
  return Object.fromEntries(tabs.map((tab, index) => [tab.title, data[index].length]));
}

async function formatCreatedTabs(token, tabState) {
  const requests = [];
  for (const title of tabState.created) {
    const tab = tabs.find(candidate => candidate.title === title);
    const sheetId = tabState.ids[title];
    if (!tab || sheetId === undefined) continue;
    requests.push(
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: tab.headers.length },
          cell: { userEnteredFormat: { backgroundColorStyle: { rgbColor: { red: 0.08, green: 0.33, blue: 0.22 } }, textFormat: { bold: true, foregroundColorStyle: { rgbColor: { red: 1, green: 1, blue: 1 } } }, verticalAlignment: "MIDDLE", wrapStrategy: "WRAP" } },
          fields: "userEnteredFormat(backgroundColorStyle,textFormat,verticalAlignment,wrapStrategy)",
        },
      },
      {
        updateSheetProperties: {
          properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount",
        },
      },
      {
        autoResizeDimensions: {
          dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: tab.headers.length },
        },
      },
      {
        setDataValidation: {
          range: { sheetId, startRowIndex: 1, endRowIndex: 2000, startColumnIndex: tab.headers.length - 1, endColumnIndex: tab.headers.length },
          rule: { condition: { type: "BOOLEAN" }, strict: true, showCustomUi: true },
        },
      },
    );
    const dateIndex = tab.headers.indexOf("Date");
    if (dateIndex >= 0) requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 2000, startColumnIndex: dateIndex, endColumnIndex: dateIndex + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: "TEXT", pattern: "@" } } }, fields: "userEnteredFormat.numberFormat",
      },
    });
    const validations = title === "Expenses"
      ? [[3, ["ငွေသား", "KPay", "WavePay", "ဘဏ်လွှဲ"]], [4, ["မတည်ငွေ", "အိုက်ပီ", "အိုက် နောင့်"]]]
      : title === "Orders" ? [[9, ["New", "Processing", "Partial", "Sold", "Paid"]]] : [];
    for (const [columnIndex, choices] of validations) requests.push({
      setDataValidation: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 2000, startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1 },
        rule: { condition: { type: "ONE_OF_LIST", values: choices.map(choice => ({ userEnteredValue: choice })) }, strict: true, showCustomUi: true },
      },
    });
  }
  if (requests.length) await google(":batchUpdate", token, { method: "POST", body: JSON.stringify({ requests }) });
}

export async function syncGoogleSheets(supabase, { importFirst = true } = {}) {
  if (!configured()) return { configured: false };
  const token = await accessToken();
  const metadata = await spreadsheetMetadata(token);
  if (businessLayout(metadata)) {
    const businessMetadata=await ensureBusinessSupplementalTabs(token,metadata);
    return syncBusinessWorkbook(supabase, token, businessMetadata, { importFirst });
  }
  const tabState = await ensureTabs(token, metadata);
  const imported = importFirst ? await importRows(supabase, token) : undefined;
  const exported = await exportRows(supabase, token);
  await formatCreatedTabs(token, tabState);
  return { configured: true, imported, exported, spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID };
}
