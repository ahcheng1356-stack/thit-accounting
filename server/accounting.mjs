import { db, json, requireUser, camelExpense, camelOrder, camelTimber } from "./_shared.mjs";
import { syncGoogleSheets } from "./google-sheets.mjs";
import { validateTransportationChange } from "./transportation-totals.mjs";

const timberDealMarker = "__TIMBER_DEAL__";
const transportationMarker = "__TRANSPORTATION__";
function camelTimberDeal(row) {
  const details = JSON.parse(row.note);
  const combined = String(details.timberDetails||"").trim(), legacy = combined.match(/^(\S+)\s+(.+)$/);
  return { id:row.id, date:row.date, timberType:details.timberType||legacy?.[1]||combined, seller:details.seller, buyer:details.buyer, timberDetails:details.timberType?combined:legacy?.[2]||combined, dealDetails:details.dealDetails, advanceDeposit:details.advanceDeposit, guideFee:details.guideFee, guideNote:details.guideNote, note:details.note };
}
function camelTransportation(row) {
  const details = JSON.parse(row.note);
  return { id:row.id, date:row.date, fromLocation:details.fromLocation, toLocation:details.toLocation, tons:details.tons, totalPrice:details.totalPrice, note:details.note, orderId:details.orderId||null, orderCustomer:details.orderCustomer||"" };
}

async function transportationRows(supabase) {
  const {data,error}=await supabase.from("taxes").select("id,note").eq("description",transportationMarker); if(error) throw error;
  return data;
}

export default async (request) => {
  try {
    const user = await requireUser(request); if (!user) return json({ error: "Unauthorized" }, 401);
    const supabase = db();
    if (request.method === "GET") {
      let sheetSync;
      try { sheetSync = await syncGoogleSheets(supabase); }
      catch (error) { sheetSync = { configured:true, error:error?.message || "Google Sheets sync failed" }; }
      const [e, o, t, x] = await Promise.all([
        supabase.from("expenses").select("*").order("date", { ascending:false }).order("id", { ascending:false }),
        supabase.from("orders").select("*").order("date", { ascending:false }).order("id", { ascending:false }),
        supabase.from("timber").select("*").order("id"),
        supabase.from("taxes").select("*").order("date", { ascending:false }).order("id", { ascending:false })
      ]);
      for (const result of [e,o,t,x]) if (result.error) throw result.error;
      const dealRows = x.data.filter(row => row.description === timberDealMarker);
      const transportationRows = x.data.filter(row => row.description === transportationMarker);
      return json({ expenses:e.data.map(camelExpense), orders:o.data.map(camelOrder), timber:t.data.map(camelTimber), taxes:x.data.filter(row => ![timberDealMarker, transportationMarker].includes(row.description)), timberDeals:dealRows.map(camelTimberDeal), transportation:transportationRows.map(camelTransportation), sheetSync });
    }
    if (user.role !== "admin") return json({ error: "Read-only account" }, 403);
    const body = await request.json();
    if (request.method === "POST" && body.type === "expense") {
      const amount = Number(body.amount); const validFunds = ["မတည်ငွေ", "အိုက်ပီ", "အိုက် နောင့်"];
      if (!(amount > 0) || !body.date || !validFunds.includes(body.paidBy) || !body.category?.trim()) return json({ error:"Missing or invalid expense fields" },400);
      const { data, error } = await supabase.from("expenses").insert({ amount, date:body.date, payment_method:body.paymentMethod||"ငွေသား", paid_by:body.paidBy, category:body.category.trim(), note:body.note?.trim()||"" }).select().single();
      if (error) throw error; await syncAfterWrite(supabase); return json({ record:camelExpense(data) },201);
    }
    if (request.method === "POST" && body.type === "order") {
      const quantity = Number(body.quantityTons), price = Number(body.unitPrice||0), paid = Number(body.paidAmount||0);
      if (!body.customer?.trim() || !body.date || !(quantity > 0) || price < 0 || paid < 0) return json({ error:"Missing or invalid order fields" },400);
      const { data, error } = await supabase.from("orders").insert({ customer:body.customer.trim(), company:body.company?.trim()||"", date:body.date, timber_type:body.timberType||"", quantity_tons:quantity, sold_tons:0, unit_price:price, paid_amount:paid, status:body.status||"New" }).select().single();
      if (error) throw error; await syncAfterWrite(supabase); return json({ record:camelOrder(data) },201);
    }
    if (request.method === "POST" && body.type === "timberDeal") {
      const deposit = Number(body.advanceDeposit||0), guideFee = Number(body.guideFee||0);
      if (!body.date || !body.timberType?.trim() || !body.seller?.trim() || !body.buyer?.trim() || !body.timberDetails?.trim() || deposit < 0 || guideFee < 0) return json({ error:"Missing or invalid timber deal fields" },400);
      const details = { timberType:body.timberType.trim(), seller:body.seller.trim(), buyer:body.buyer.trim(), timberDetails:body.timberDetails.trim(), dealDetails:body.dealDetails?.trim()||"", advanceDeposit:deposit, guideFee, guideNote:body.guideNote?.trim()||"", note:body.note?.trim()||"" };
      const { data, error } = await supabase.from("taxes").insert({ date:body.date, description:timberDealMarker, amount:0, note:JSON.stringify(details) }).select().single();
      if (error) throw error; await syncAfterWrite(supabase); return json({ record:camelTimberDeal(data) },201);
    }
    if (request.method === "POST" && body.type === "transportation") {
      const tons=Number(body.tons), totalPrice=Number(body.totalPrice), orderId=Number(body.orderId);
      if (!body.date || !body.fromLocation?.trim() || !body.toLocation?.trim() || !(tons>0) || !Number.isFinite(tons) || !Number.isFinite(totalPrice) || totalPrice<0 || !(orderId>0)) return json({error:"Missing or invalid transportation fields"},400);
      const currentRows=await transportationRows(supabase);
      const details={ fromLocation:body.fromLocation.trim(), toLocation:body.toLocation.trim(), tons, totalPrice, note:body.note?.trim()||"", orderId, orderCustomer:"", calculationVersion:3 };
      const pending={id:0,note:JSON.stringify(details)};
      await validateTransportationChange(supabase,currentRows,[...currentRows,pending]);
      const { data, error } = await supabase.from("taxes").insert({ date:body.date, description:transportationMarker, amount:0, note:pending.note }).select().single();
      if (error) throw error;
      await syncAfterWrite(supabase); return json({record:camelTransportation(data)},201);
    }
    if (request.method === "PATCH") {
      const id = Number(body.id); if (!(id > 0)) return json({ error:"Invalid record" },400);
      if (body.type === "expense") {
        const amount = Number(body.amount); const validFunds = ["မတည်ငွေ", "အိုက်ပီ", "အိုက် နောင့်"];
        if (!(amount > 0) || !body.date || !validFunds.includes(body.paidBy) || !body.category?.trim()) return json({ error:"Missing or invalid expense fields" },400);
        const changes = { amount, date:body.date, payment_method:body.paymentMethod||"ငွေသား", paid_by:body.paidBy, category:body.category.trim(), note:body.note?.trim()||"" };
        const { data, error } = await supabase.from("expenses").update(changes).eq("id",id).select().single(); if(error) throw error;
        await syncAfterWrite(supabase); return json({record:camelExpense(data)});
      }
      if (body.type === "timberDeal") {
        const deposit = Number(body.advanceDeposit||0), guideFee = Number(body.guideFee||0);
        if (!body.date || !body.timberType?.trim() || !body.seller?.trim() || !body.buyer?.trim() || !body.timberDetails?.trim() || deposit < 0 || guideFee < 0) return json({ error:"Missing or invalid timber deal fields" },400);
        const details = { timberType:body.timberType.trim(), seller:body.seller.trim(), buyer:body.buyer.trim(), timberDetails:body.timberDetails.trim(), dealDetails:body.dealDetails?.trim()||"", advanceDeposit:deposit, guideFee, guideNote:body.guideNote?.trim()||"", note:body.note?.trim()||"" };
        const { data, error } = await supabase.from("taxes").update({ date:body.date, amount:0, note:JSON.stringify(details) }).eq("id",id).eq("description",timberDealMarker).select().single(); if(error) throw error;
        await syncAfterWrite(supabase); return json({record:camelTimberDeal(data)});
      }
      if (body.type === "transportation") {
        const tons=Number(body.tons), totalPrice=Number(body.totalPrice), orderId=Number(body.orderId);
        if (!body.date || !body.fromLocation?.trim() || !body.toLocation?.trim() || !(tons>0) || !Number.isFinite(tons) || !Number.isFinite(totalPrice) || totalPrice<0 || !(orderId>0)) return json({error:"Missing or invalid transportation fields"},400);
        const currentRows=await transportationRows(supabase), current=currentRows.find(row=>Number(row.id)===id); if(!current) return json({error:"Record not found"},404);
        const details={ fromLocation:body.fromLocation.trim(), toLocation:body.toLocation.trim(), tons, totalPrice, note:body.note?.trim()||"", orderId, orderCustomer:JSON.parse(current.note).orderCustomer||"", calculationVersion:3 };
        const replacement={id,note:JSON.stringify(details)}, nextRows=currentRows.map(row=>Number(row.id)===id?replacement:row);
        await validateTransportationChange(supabase,currentRows,nextRows);
        const { data, error } = await supabase.from("taxes").update({ date:body.date, amount:0, note:replacement.note }).eq("id",id).eq("description",transportationMarker).select().single();
        if(error) throw error;
        await syncAfterWrite(supabase); return json({record:camelTransportation(data)});
      }
      if (!body.type || body.type === "order") {
        const fullEdit = body.customer !== undefined || body.quantityTons !== undefined || body.date !== undefined;
        const { data:current, error:findError } = await supabase.from("orders").select("*").eq("id",id).single(); if(findError) throw findError;
        const changes = {};
        if (fullEdit) {
          const quantity=Number(body.quantityTons), sold=Number(body.soldTons||0), price=Number(body.unitPrice||0), paid=Number(body.paidAmount||0);
          const validStatuses=["New","Processing","Partial","Sold","Paid"];
          if (!body.customer?.trim() || !body.date || !(quantity>0) || sold<0 || sold>quantity || price<0 || paid<0 || !validStatuses.includes(body.status)) return json({error:"Missing or invalid order fields"},400);
          Object.assign(changes,{ customer:body.customer.trim(), company:body.company?.trim()||"", date:body.date, timber_type:body.timberType?.trim()||"", quantity_tons:quantity, sold_tons:sold, unit_price:price, paid_amount:paid, status:body.status });
        } else {
          if (body.paidAmount !== undefined) {
            const paid = Number(body.paidAmount);
            if (body.paidAmount === null || String(body.paidAmount).trim() === "" || !Number.isFinite(paid) || paid < 0) return json({error:"Received payment must be a non-negative number"},400);
            changes.paid_amount = paid;
          }
          if (body.unitPrice !== undefined) { const price=Number(body.unitPrice); if(price<0) return json({error:"Invalid price"},400); changes.unit_price=price; }
          if (body.soldTons !== undefined) {
            const sold=Number(body.soldTons); if(sold<0 || sold>Number(current.quantity_tons)) return json({error:"Sold tons must be between 0 and ordered tons"},400);
            changes.sold_tons=sold; changes.status=sold===Number(current.quantity_tons)?"Sold":sold>0?"Partial":"New";
          }
        }
        if (!Object.keys(changes).length) return json({error:"No changes"},400);
        const { data, error } = await supabase.from("orders").update(changes).eq("id",id).select().single(); if(error) throw error;
        await syncAfterWrite(supabase); return json({record:camelOrder(data)});
      }
      return json({error:"Invalid record type"},400);
    }
    if (request.method === "DELETE") {
      const id = Number(body.id);
      const tables = { expense: "expenses", order: "orders", timberDeal: "taxes", transportation:"taxes" };
      const table = tables[body.type];
      if (!(id > 0) || !table) return json({ error:"Invalid record" },400);
      let query = supabase.from(table).delete().eq("id", id);
      if (body.type === "timberDeal") query = query.eq("description", timberDealMarker);
      if (body.type === "transportation") query = query.eq("description", transportationMarker);
      const { data, error } = await query.select("id").maybeSingle();
      if (error) throw error;
      if (!data) return json({ error:"Record not found" },404);
      await syncAfterWrite(supabase); return json({ deleted:true, id });
    }
    return json({ error:"Unsupported request" },400);
  } catch (error) { return json({ error:error?.message || "Database error" },500); }
};

async function syncAfterWrite(supabase) {
  try { await syncGoogleSheets(supabase, { importFirst:false }); }
  catch (error) { console.error("Google Sheets export failed", error); }
}
