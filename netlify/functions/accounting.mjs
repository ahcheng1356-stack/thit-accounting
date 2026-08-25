import { db, json, requireUser, camelExpense, camelOrder, camelTimber } from "./_shared.mjs";

export default async (request) => {
  try {
    const user = await requireUser(request); if (!user) return json({ error: "Unauthorized" }, 401);
    const supabase = db();
    if (request.method === "GET") {
      const [e, o, t, x] = await Promise.all([
        supabase.from("expenses").select("*").order("date", { ascending:false }).order("id", { ascending:false }),
        supabase.from("orders").select("*").order("date", { ascending:false }).order("id", { ascending:false }),
        supabase.from("timber").select("*").order("id"),
        supabase.from("taxes").select("*").order("date", { ascending:false }).order("id", { ascending:false })
      ]);
      for (const result of [e,o,t,x]) if (result.error) throw result.error;
      return json({ expenses:e.data.map(camelExpense), orders:o.data.map(camelOrder), timber:t.data.map(camelTimber), taxes:x.data });
    }
    const body = await request.json();
    if (request.method === "POST" && body.type === "expense") {
      const amount = Number(body.amount); const validFunds = ["မတည်ငွေ", "အိုက်ပီ", "အိုက် နောင့်"];
      if (!(amount > 0) || !body.date || !validFunds.includes(body.paidBy) || !body.category?.trim()) return json({ error:"Missing or invalid expense fields" },400);
      const { data, error } = await supabase.from("expenses").insert({ amount, date:body.date, payment_method:body.paymentMethod||"ငွေသား", paid_by:body.paidBy, category:body.category.trim(), note:body.note?.trim()||"" }).select().single();
      if (error) throw error; return json({ record:camelExpense(data) },201);
    }
    if (request.method === "POST" && body.type === "order") {
      const quantity = Number(body.quantityTons), price = Number(body.unitPrice||0), paid = Number(body.paidAmount||0);
      if (!body.customer?.trim() || !body.date || !(quantity > 0) || price < 0 || paid < 0) return json({ error:"Missing or invalid order fields" },400);
      const { data, error } = await supabase.from("orders").insert({ customer:body.customer.trim(), company:body.company?.trim()||"", date:body.date, timber_type:body.timberType||"", quantity_tons:quantity, sold_tons:0, unit_price:price, paid_amount:paid, status:body.status||"New" }).select().single();
      if (error) throw error; return json({ record:camelOrder(data) },201);
    }
    if (request.method === "PATCH") {
      const id = Number(body.id); if (!(id > 0)) return json({ error:"Invalid order" },400);
      const changes = {};
      if (body.unitPrice !== undefined) { const p=Number(body.unitPrice); if (p<0) return json({error:"Invalid price"},400); changes.unit_price=p; }
      if (body.soldTons !== undefined) {
        const { data:current, error:findError } = await supabase.from("orders").select("quantity_tons").eq("id",id).single(); if(findError) throw findError;
        const sold=Number(body.soldTons); if(sold<0 || sold>Number(current.quantity_tons)) return json({error:"Sold tons must be between 0 and ordered tons"},400);
        changes.sold_tons=sold; changes.status=sold===Number(current.quantity_tons)?"Sold":sold>0?"Partial":"New";
      }
      if (!Object.keys(changes).length) return json({error:"No changes"},400);
      const { data, error } = await supabase.from("orders").update(changes).eq("id",id).select().single(); if(error) throw error;
      return json({record:camelOrder(data)});
    }
    return json({ error:"Unsupported request" },400);
  } catch (error) { return json({ error:error instanceof Error?error.message:"Database error" },500); }
};
